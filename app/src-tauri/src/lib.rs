// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn resolve_backup_path(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let backups_dir = app_data_dir.join("backups");
    std::fs::create_dir_all(&backups_dir).map_err(|error| error.to_string())?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?;
    let file_name = format!(
        "notazod-backup-{}-{}.db",
        timestamp.as_secs(),
        timestamp.subsec_nanos()
    );

    Ok(backups_dir.join(file_name).to_string_lossy().into_owned())
}

fn validate_db_name(db_name: &str) -> Result<(), String> {
    let path = std::path::Path::new(db_name);
    if path.components().count() != 1 {
        return Err("Invalid database name".into());
    }
    let valid = !db_name.is_empty()
        && db_name.ends_with(".db")
        && db_name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
    if !valid {
        return Err("Invalid database name".into());
    }
    Ok(())
}

// Validates magic header, page-size power-of-two sanity, and file-length/page-size
// alignment. This rejects zero-length/truncated files and obvious corruption, but it
// is not a full SQLite integrity check (e.g. PRAGMA integrity_check); doing that
// without adding a dependency would require shelling out or embedding a SQLite
// reader, so full validation remains a known limitation.
fn validate_sqlite_file(path: &std::path::Path) -> Result<(), String> {
    use std::io::Read;

    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() == 0 {
        return Err("Selected file is empty".into());
    }

    let mut file = std::fs::File::open(path).map_err(|error| error.to_string())?;
    let mut header = [0u8; 100];
    file.read_exact(&mut header)
        .map_err(|_| "Selected file is too small to be a valid SQLite database".to_string())?;

    if &header[0..16] != b"SQLite format 3\0" {
        return Err("Selected file is not a valid SQLite database".into());
    }

    let page_size_raw = u16::from_be_bytes([header[16], header[17]]);
    let page_size: u64 = if page_size_raw == 1 {
        65536
    } else {
        page_size_raw as u64
    };
    if page_size < 512 || (page_size & (page_size - 1)) != 0 {
        return Err("Selected file has an invalid SQLite page size".into());
    }
    if metadata.len() % page_size != 0 {
        return Err("Selected file appears truncated or corrupted".into());
    }

    Ok(())
}

#[tauri::command]
fn stage_restore(app: tauri::AppHandle, db_name: String, source_path: String) -> Result<(), String> {
    use tauri::Manager;

    validate_db_name(&db_name)?;

    let source = std::path::Path::new(&source_path);
    if !source.is_file() {
        return Err("Selected file is not a regular file".into());
    }
    validate_sqlite_file(source)?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;

    let pending_path = app_data_dir.join(format!("{db_name}.pending-restore"));
    let temp_path = app_data_dir.join(format!("{db_name}.pending-restore.tmp"));

    std::fs::copy(source, &temp_path).map_err(|error| error.to_string())?;
    std::fs::rename(&temp_path, &pending_path).map_err(|error| error.to_string())?;

    Ok(())
}

// `fatal: true` means the active database file could not be confirmed present after
// a rollback attempt (a pre-existing database was moved aside but could not be moved
// back). Callers must treat fatal errors as a hard stop and never open the database
// layer afterward, since that would let SQLite silently create a new empty file.
#[derive(serde::Serialize)]
struct RestoreError {
    fatal: bool,
    message: String,
    #[serde(rename = "backupPath")]
    backup_path: Option<String>,
}

impl RestoreError {
    fn recoverable(message: impl Into<String>) -> Self {
        RestoreError {
            fatal: false,
            message: message.into(),
            backup_path: None,
        }
    }

    fn fatal(message: impl Into<String>, backup_path: Option<String>) -> Self {
        RestoreError {
            fatal: true,
            message: message.into(),
            backup_path,
        }
    }
}

fn roll_back_and_report(
    moved_db: bool,
    backup_db_path: &std::path::Path,
    db_path: &std::path::Path,
    moved_sidecars: Vec<(std::path::PathBuf, std::path::PathBuf)>,
    original_error: String,
) -> RestoreError {
    let mut rollback_failed = false;
    if moved_db && std::fs::rename(backup_db_path, db_path).is_err() {
        rollback_failed = true;
    }
    let mut sidecar_rollback_failed = false;
    for (backup_sidecar_path, sidecar_path) in moved_sidecars {
        if std::fs::rename(&backup_sidecar_path, &sidecar_path).is_err() {
            sidecar_rollback_failed = true;
        }
    }

    // Fatal whenever the active database's post-rollback presence can't be confirmed, even
    // when `moved_db` is false (no pre-existing database): otherwise `initDatabase()` would
    // continue and let SQLite silently create a new empty file at `db_path`, masking the
    // failed restore instead of stopping and preserving the pending restore for retry.
    // A failed sidecar rollback is fatal too: leftover misplaced `-wal`/`-shm` files next to
    // the restored or recovered database risk stale writes being replayed against it.
    if rollback_failed || sidecar_rollback_failed || !db_path.is_file() {
        let recovery_guidance = if moved_db {
            format!(
                "The pre-restore backup is preserved at {}. Do not reopen the app until the database file is manually restored from this backup; the pending restore has been kept for retry.",
                backup_db_path.display()
            )
        } else {
            "No pre-restore backup exists because there was no active database before this attempt. Do not reopen the app until the database file's presence is manually confirmed; the pending restore has been kept for retry.".to_string()
        };
        return RestoreError::fatal(
            format!(
                "Restore failed and the active database could not be confirmed restored: {original_error}. {recovery_guidance}"
            ),
            moved_db.then(|| backup_db_path.to_string_lossy().into_owned()),
        );
    }

    RestoreError::recoverable(format!(
        "Restore failed, current database kept active, pending restore retained for retry: {original_error}"
    ))
}

#[tauri::command]
fn apply_pending_restore(app: tauri::AppHandle, db_name: String) -> Result<bool, RestoreError> {
    use tauri::Manager;

    validate_db_name(&db_name).map_err(RestoreError::recoverable)?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| RestoreError::recoverable(error.to_string()))?;
    let pending_path = app_data_dir.join(format!("{db_name}.pending-restore"));
    if !pending_path.is_file() {
        return Ok(false);
    }

    if let Err(error) = validate_sqlite_file(&pending_path) {
        return Err(RestoreError::recoverable(format!(
            "Pending restore file is invalid: {error}"
        )));
    }

    let db_path = app_data_dir.join(&db_name);
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| RestoreError::recoverable(error.to_string()))?;
    let backup_suffix = format!("before-restore-{}-{}", timestamp.as_secs(), timestamp.subsec_nanos());

    let sidecars = ["-wal", "-shm"];
    let mut moved_db = false;
    let mut moved_sidecars: Vec<(std::path::PathBuf, std::path::PathBuf)> = Vec::new();
    let backup_db_path = app_data_dir.join(format!("{db_name}.{backup_suffix}"));

    if db_path.is_file() {
        if let Err(error) = std::fs::rename(&db_path, &backup_db_path) {
            return Err(RestoreError::recoverable(error.to_string()));
        }
        moved_db = true;
    }

    for suffix in sidecars {
        let sidecar_path = app_data_dir.join(format!("{db_name}{suffix}"));
        if sidecar_path.is_file() {
            let backup_sidecar_path =
                app_data_dir.join(format!("{db_name}{suffix}.{backup_suffix}"));
            match std::fs::rename(&sidecar_path, &backup_sidecar_path) {
                Ok(()) => moved_sidecars.push((backup_sidecar_path, sidecar_path)),
                Err(sidecar_error) => {
                    return Err(roll_back_and_report(
                        moved_db,
                        &backup_db_path,
                        &db_path,
                        moved_sidecars,
                        sidecar_error.to_string(),
                    ));
                }
            }
        }
    }

    match std::fs::rename(&pending_path, &db_path) {
        Ok(()) => Ok(true),
        Err(install_error) => Err(roll_back_and_report(
            moved_db,
            &backup_db_path,
            &db_path,
            moved_sidecars,
            install_error.to_string(),
        )),
    }
}

// The Campus upload tool is embedded so the packaged app does not depend on the repository.
const CAMPUS_UPLOAD_SCRIPT: &str = include_str!("../../../tools/campus-upload/campus-upload.mjs");
const CAMPUS_GRADES_LIB: &str = include_str!("../../../tools/campus-upload/grades.mjs");

// GUI apps on macOS start with a minimal PATH, so look in the usual install locations first.
fn find_ego_browser() -> Result<std::path::PathBuf, String> {
    let mut candidates = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        candidates.push(std::path::PathBuf::from(home).join(".local/bin/ego-browser"));
    }
    candidates.push(std::path::PathBuf::from("/opt/homebrew/bin/ego-browser"));
    candidates.push(std::path::PathBuf::from("/usr/local/bin/ego-browser"));
    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path).map(|dir| dir.join("ego-browser")));
    }
    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| "ego-browser is not installed".to_string())
}

// Runs the Campus upload for one course and returns its JSON report plus the tool log.
// With save = false it only verifies; the tool itself refuses to save unless every group of the course is verified.
#[tauri::command]
async fn campus_upload(
    app: tauri::AppHandle,
    db_name: String,
    course_id: String,
    save: bool,
) -> Result<serde_json::Value, String> {
    use std::io::Write;
    use tauri::Manager;

    validate_db_name(&db_name)?;
    if course_id.trim().is_empty() {
        return Err("Missing course".into());
    }
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(&db_name);
    if !db_path.is_file() {
        return Err(format!("Database not found: {}", db_path.display()));
    }
    let ego_browser = find_ego_browser()?;

    let work_dir = std::env::temp_dir().join(format!("notazod-campus-upload-{}", std::process::id()));
    std::fs::create_dir_all(&work_dir).map_err(|error| error.to_string())?;
    let lib_path = work_dir.join("grades.mjs");
    std::fs::write(&lib_path, CAMPUS_GRADES_LIB).map_err(|error| error.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let report_path = work_dir.join(format!("report-{stamp}.json"));
    let config = serde_json::json!({
        "dbPath": db_path.to_string_lossy(),
        "libUrl": format!("file://{}", lib_path.to_string_lossy().replace(' ', "%20")),
        "save": save,
        "reportPath": report_path.to_string_lossy(),
        "courseId": course_id,
    });
    let script = format!("const CONFIG = {config};\n{CAMPUS_UPLOAD_SCRIPT}");

    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut child = std::process::Command::new(ego_browser)
            .arg("nodejs")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()?;
        // Dropping stdin after the write closes it, which starts the script.
        child
            .stdin
            .take()
            .expect("stdin is piped")
            .write_all(script.as_bytes())?;
        child.wait_with_output()
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;

    let log = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let report = std::fs::read_to_string(&report_path);
    let _ = std::fs::remove_file(&report_path);
    match report {
        Ok(text) => {
            let mut value: serde_json::Value =
                serde_json::from_str(&text).map_err(|error| error.to_string())?;
            value["exitOk"] = serde_json::Value::Bool(output.status.success());
            value["log"] = serde_json::Value::String(log);
            Ok(value)
        }
        Err(_) => {
            let tail: Vec<&str> = log.lines().rev().take(12).collect();
            let tail: Vec<&str> = tail.into_iter().rev().collect();
            Err(format!("The Campus upload stopped without a report.\n{}", tail.join("\n")))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            let _ = app;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            resolve_backup_path,
            stage_restore,
            apply_pending_restore,
            campus_upload
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
