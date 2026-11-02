// Injected into every page of the NOTAZOD Campus window before the page's own scripts.
// While NOTAZOD is uploading (sessionStorage flag set by the app), JavaScript dialogs are answered
// automatically: only the Campus save confirmation ("¿Esta seguro?") is accepted, anything else is
// dismissed. Every answered dialog is recorded so the app can report it. Outside an upload the
// browser's own dialogs are used, so the teacher sees them while logging in.
(function () {
  if (window.__notazodCampus) return;
  window.__notazodCampus = true;
  var AUTO_KEY = "notazodCampusAuto";
  var LOG_KEY = "notazodCampusDialogs";
  var nativeConfirm = window.confirm.bind(window);
  var nativeAlert = window.alert.bind(window);
  function automated() {
    try { return sessionStorage.getItem(AUTO_KEY) === "1"; } catch (error) { return false; }
  }
  function record(type, message, answer) {
    try {
      var list = JSON.parse(sessionStorage.getItem(LOG_KEY) || "[]");
      list.push({ type: type, message: String(message == null ? "" : message), answer: answer, at: Date.now() });
      sessionStorage.setItem(LOG_KEY, JSON.stringify(list.slice(-20)));
    } catch (error) { /* storage unavailable: the read-back still decides the result */ }
  }
  function normalize(text) {
    return String(text == null ? "" : text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u00bf?]/g, "").trim().toLowerCase();
  }
  window.confirm = function (message) {
    if (!automated()) return nativeConfirm(message);
    var accepted = normalize(message) === "esta seguro";
    record("confirm", message, accepted);
    return accepted;
  };
  window.alert = function (message) {
    if (!automated()) return nativeAlert(message);
    record("alert", message, true);
  };
})();
