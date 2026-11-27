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

// Exports (period image, grades file) are saved to the user's Downloads folder. Only a plain file
// name that is safe on macOS and Windows is accepted: no separators, drive prefixes, ".." or other
// path components, no hidden names, no characters or device names Windows forbids, no bidi controls.
fn validate_export_file_name(file_name: &str) -> Result<(), String> {
    const WINDOWS_DEVICES: [&str; 22] = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    let invalid = || "Nombre de archivo no válido".to_string();
    // Windows ignores everything after the first dot when matching device names ("nul.tar.gz").
    let device_stem = file_name.split('.').next().unwrap_or("");
    if file_name.is_empty()
        || file_name.contains("..")
        || file_name.starts_with('.')
        || file_name.starts_with(' ')
        || file_name.ends_with('.')
        || file_name.ends_with(' ')
        || WINDOWS_DEVICES.iter().any(|device| device_stem.eq_ignore_ascii_case(device))
        || file_name.chars().any(|c| {
            matches!(c, '/' | '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}')
                || c.is_control()
        })
    {
        return Err(invalid());
    }
    let mut components = std::path::Path::new(file_name).components();
    match (components.next(), components.next()) {
        (Some(std::path::Component::Normal(name)), None) if name == file_name => Ok(()),
        _ => Err(invalid()),
    }
}

// `name.ext` for attempt 0, then `name (n).ext`, like the browser numbered repeated downloads.
fn export_candidate_name(file_name: &str, attempt: u32) -> String {
    if attempt == 0 {
        return file_name.to_string();
    }
    match file_name.rfind('.') {
        Some(dot) if dot > 0 => format!("{} ({attempt}){}", &file_name[..dot], &file_name[dot..]),
        _ => format!("{file_name} ({attempt})"),
    }
}

// Creates the first free candidate with create_new, so an existing file is never overwritten,
// even if another file with that name appears between the check and the write.
fn write_unique(dir: &std::path::Path, file_name: &str, bytes: &[u8]) -> std::io::Result<std::path::PathBuf> {
    use std::io::Write;

    for attempt in 0..10_000 {
        let path = dir.join(export_candidate_name(file_name, attempt));
        let mut file = match std::fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        };
        if let Err(error) = file.write_all(bytes).and_then(|()| file.sync_all()) {
            drop(file);
            // Only the file this call just created is removed; nothing pre-existing is touched.
            let _ = std::fs::remove_file(&path);
            return Err(error);
        }
        return Ok(path);
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::AlreadyExists,
        "No hay un nombre libre para el archivo en Descargas",
    ))
}

#[tauri::command]
fn save_to_downloads(app: tauri::AppHandle, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    use tauri::Manager;

    validate_export_file_name(&file_name)?;
    let downloads = app.path().download_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&downloads).map_err(|error| error.to_string())?;
    let path = write_unique(&downloads, &file_name, &bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

// The Campus opens in its own NOTAZOD window. The window has no capability, so the Campus page
// cannot call the app; the main window drives it through campus_eval instead.
const CAMPUS_HOST: &str = "campus2.unimayor.edu.co";
const CAMPUS_START_URL: &str =
    "https://campus2.unimayor.edu.co/CampusRegistroNotas/Formularios/wfListarGruposCalif.aspx";
const CAMPUS_WINDOW: &str = "campus";
const CAMPUS_INIT_SCRIPT: &str = include_str!("campus_init.js");

fn is_campus_url(url: &tauri::Url) -> bool {
    url.scheme() == "https" && url.host_str() == Some(CAMPUS_HOST)
}

#[tauri::command]
async fn campus_open(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window(CAMPUS_WINDOW) {
        let _ = window.unminimize();
        window.show().map_err(|error| error.to_string())?;
        tile_with_campus(&app, &window).await;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    let url = CAMPUS_START_URL.parse::<tauri::Url>().map_err(|error| error.to_string())?;
    let window = tauri::WebviewWindowBuilder::new(&app, CAMPUS_WINDOW, tauri::WebviewUrl::External(url))
        .title("Campus Unimayor - NOTAZOD")
        .inner_size(1100.0, 800.0)
        .initialization_script(CAMPUS_INIT_SCRIPT)
        // The window only ever shows the Campus.
        .on_navigation(|url| is_campus_url(url) || url.scheme() == "about")
        .build()
        .map_err(|error| error.to_string())?;
    tile_with_campus(&app, &window).await;
    let _ = window.set_focus();
    Ok(())
}

// Left and right halves (x, y, width, height) of a work area; an odd pixel goes to the right half.
fn split_halves(x: i32, y: i32, width: u32, height: u32) -> ((i32, i32, u32, u32), (i32, i32, u32, u32)) {
    let left = width / 2;
    ((x, y, left, height), (x + left as i32, y, width - left, height))
}

// Fills the screen NOTAZOD is on: NOTAZOD on the left half, the Campus on the right half, both in
// front, so neither window opens hidden behind other apps. Best effort: a failure leaves the windows as they are.
async fn tile_with_campus(app: &tauri::AppHandle, campus: &tauri::WebviewWindow) {
    use tauri::{Manager, PhysicalPosition, PhysicalSize};

    let Some(main) = app.get_webview_window("main") else { return };
    // Leaving macOS full screen is animated and moves the window to another Space; resizing before it
    // ends is lost, so wait for the animation when either window was in full screen.
    let was_fullscreen = [&main, campus].iter().any(|window| window.is_fullscreen().unwrap_or(false));
    for window in [&main, campus] {
        let _ = window.set_fullscreen(false);
        let _ = window.unmaximize();
        let _ = window.unminimize();
        let _ = window.show();
    }
    if was_fullscreen {
        let _ = tauri::async_runtime::spawn_blocking(|| std::thread::sleep(std::time::Duration::from_millis(900))).await;
    }
    let Ok(Some(monitor)) = main.current_monitor() else { return };
    let area = monitor.work_area();
    let (left, right) = split_halves(area.position.x, area.position.y, area.size.width, area.size.height);
    for (window, (x, y, width, height)) in [(&main, left), (campus, right)] {
        // set_size sets the inner size; subtract the title bar and borders so the outer frame fits.
        let (Ok(outer), Ok(inner)) = (window.outer_size(), window.inner_size()) else { continue };
        let frame_w = outer.width.saturating_sub(inner.width);
        let frame_h = outer.height.saturating_sub(inner.height);
        let _ = window.set_position(PhysicalPosition::new(x, y));
        let _ = window.set_size(PhysicalSize::new(width.saturating_sub(frame_w), height.saturating_sub(frame_h)));
    }
    // Raise NOTAZOD first; the caller then focuses the Campus, so both end up above other apps.
    let _ = main.set_focus();
}

// Evaluates a synchronous script in the Campus window and returns its JSON-serialized result.
// Refuses to run unless the window is on the Campus host.
#[tauri::command]
async fn campus_eval(app: tauri::AppHandle, script: String) -> Result<String, String> {
    use tauri::Manager;

    let window = app
        .get_webview_window(CAMPUS_WINDOW)
        .ok_or_else(|| "The Campus window is closed".to_string())?;
    let url = window.url().map_err(|error| error.to_string())?;
    if !is_campus_url(&url) {
        return Err(format!("The Campus window is not showing the Campus ({url})"));
    }
    let (sender, receiver) = std::sync::mpsc::channel();
    window
        .eval_with_callback(script, move |result| {
            let _ = sender.send(result);
        })
        .map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(std::time::Duration::from_secs(15))
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|_| "The Campus window did not answer".to_string())
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
            campus_open,
            campus_eval,
            save_to_downloads
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod export_tests {
    use super::{export_candidate_name, validate_export_file_name, write_unique};

    fn scratch_dir(label: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("notazod-export-{label}-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn accepts_plain_export_file_names() {
        for name in ["notazod-corte-2.png", "plantilla-notas-corte-3.csv", "plantilla-notas-corte-1.xls", "notas (1).png"] {
            assert_eq!(validate_export_file_name(name), Ok(()), "{name}");
        }
    }

    #[test]
    fn rejects_empty_names_and_any_path_component() {
        for name in [
            "", ".", "..", "...", "../notas.csv", "a/../b.csv", "dir/notas.csv", "/etc/passwd", "dir\\notas.csv",
            "C:notas.csv", "notas..csv", "no\0tas.csv", "\\\\server\\share", "./x", "x/", "/", "\\", "a:stream",
        ] {
            assert_rejected(name);
        }
    }

    fn assert_rejected(name: &str) {
        assert_eq!(validate_export_file_name(name), Err("Nombre de archivo no válido".to_string()), "{name:?}");
    }

    #[test]
    fn rejects_hidden_names_starting_with_a_dot() {
        for name in [".notas.csv", ".oculto", ".png"] {
            assert_rejected(name);
        }
    }

    #[test]
    fn rejects_a_trailing_dot_or_space_and_a_leading_space() {
        for name in ["notas.csv.", "notas.", "notas.csv ", "notas ", " notas.csv", " "] {
            assert_rejected(name);
        }
    }

    #[test]
    fn rejects_windows_reserved_device_names_in_any_case_with_or_without_extension() {
        for name in [
            "CON", "con", "Con.png", "PRN.csv", "aux", "AUX.xls", "NUL", "nul.tar.gz", "COM1", "com9.png", "LPT1", "lpt9.csv",
        ] {
            assert_rejected(name);
        }
        // Only the exact device names are reserved.
        for name in ["CONSOLA.csv", "com10.png", "LPT0.csv", "nulo.xls", "auxiliar.png", "notas-con.csv"] {
            assert_eq!(validate_export_file_name(name), Ok(()), "{name}");
        }
    }

    #[test]
    fn rejects_bidi_control_characters() {
        for c in ['\u{202A}', '\u{202B}', '\u{202C}', '\u{202D}', '\u{202E}', '\u{2066}', '\u{2067}', '\u{2068}', '\u{2069}'] {
            assert_rejected(&format!("notas{c}gnp.csv"));
        }
    }

    #[test]
    fn rejects_characters_windows_forbids_in_file_names() {
        for name in ["a<b.csv", "a>b.csv", "a\"b.csv", "a|b.csv", "a?b.csv", "a*b.csv"] {
            assert_rejected(name);
        }
    }

    #[cfg(unix)]
    #[test]
    fn skips_an_existing_directory_or_a_dangling_symlink_at_the_target_name() {
        let dir = scratch_dir("occupied");
        std::fs::create_dir(dir.join("notazod-corte-2.png")).unwrap();
        std::os::unix::fs::symlink(dir.join("missing-target.png"), dir.join("notazod-corte-2 (1).png")).unwrap();
        let path = write_unique(&dir, "notazod-corte-2.png", b"new").unwrap();
        assert_eq!(path, dir.join("notazod-corte-2 (2).png"));
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        assert!(dir.join("notazod-corte-2.png").is_dir());
        assert!(!dir.join("missing-target.png").exists(), "the dangling symlink must not be followed");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn candidate_names_number_before_the_extension_like_the_browser() {
        assert_eq!(export_candidate_name("notazod-corte-2.png", 0), "notazod-corte-2.png");
        assert_eq!(export_candidate_name("notazod-corte-2.png", 1), "notazod-corte-2 (1).png");
        assert_eq!(export_candidate_name("plantilla-notas-corte-3.csv", 2), "plantilla-notas-corte-3 (2).csv");
        assert_eq!(export_candidate_name("sin-extension", 1), "sin-extension (1)");
        assert_eq!(export_candidate_name(".oculto", 1), ".oculto (1)");
    }

    #[test]
    fn writes_the_plain_name_when_free() {
        let dir = scratch_dir("free");
        let path = write_unique(&dir, "notazod-corte-2.png", b"png").unwrap();
        assert_eq!(path, dir.join("notazod-corte-2.png"));
        assert_eq!(std::fs::read(&path).unwrap(), b"png");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn never_overwrites_and_picks_the_next_free_number() {
        let dir = scratch_dir("taken");
        std::fs::write(dir.join("notazod-corte-2.png"), b"old").unwrap();
        std::fs::write(dir.join("notazod-corte-2 (1).png"), b"old1").unwrap();
        let path = write_unique(&dir, "notazod-corte-2.png", b"new").unwrap();
        assert_eq!(path, dir.join("notazod-corte-2 (2).png"));
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        assert_eq!(std::fs::read(dir.join("notazod-corte-2.png")).unwrap(), b"old");
        assert_eq!(std::fs::read(dir.join("notazod-corte-2 (1).png")).unwrap(), b"old1");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}

#[cfg(test)]
mod split_tests {
    use super::split_halves;

    #[test]
    fn splits_the_work_area_into_left_and_right_halves() {
        assert_eq!(split_halves(0, 25, 1440, 875), ((0, 25, 720, 875), (720, 25, 720, 875)));
    }

    #[test]
    fn an_odd_width_gives_the_extra_pixel_to_the_right_half() {
        assert_eq!(split_halves(-1920, 0, 1921, 1080), ((-1920, 0, 960, 1080), (-960, 0, 961, 1080)));
    }
}
