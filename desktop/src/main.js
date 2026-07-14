// Frontend точка входа: спрашиваем у Rust-shell, где живёт локальный
// Python-сервис, и показываем его UI внутри iframe. Дальше — свои панели.
import { invoke } from "@tauri-apps/api/core";

const statusEl = document.getElementById("service-status");
const frame = document.getElementById("workspace-frame");

function setStatus(text, level = "") {
  statusEl.textContent = text;
  statusEl.className = "badge" + (level ? " " + level : "");
}

async function boot() {
  setStatus("Служба: запускаю…");
  try {
    // Rust спавнит FastAPI из ../audio-service и возвращает базовый URL, когда
    // /api/health отвечает 200. См. src-tauri/src/python_sidecar.rs.
    const baseUrl = await invoke("service_url");
    frame.src = baseUrl + "/";
    setStatus("Служба: онлайн", "ok");
  } catch (err) {
    setStatus("Служба: ошибка", "error");
    console.error(err);
    frame.srcdoc = `
      <div style="font-family: system-ui; padding: 40px; color:#a51028">
        <h2>Не удалось запустить Python-службу</h2>
        <pre style="white-space: pre-wrap">${String(err)}</pre>
        <p>Проверь, что установлены зависимости из
        <code>../audio-service/requirements.txt</code> и Python 3.10–3.11.</p>
      </div>`;
  }
}

boot();
