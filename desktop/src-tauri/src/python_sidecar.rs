//! Спавн локального Python-сервиса (наш audio-service/FastAPI).
//!
//! В dev режиме берём ../../audio-service и uvicorn из его venv (пользователь
//! должен был поставить requirements). В release-бандле нам понадобится
//! embedded Python — этап 6 (Упаковка); пока считаем, что Python берётся
//! из окружения.
use anyhow::{anyhow, Context, Result};
use std::net::TcpListener;
use std::process::Stdio;
use std::time::Duration;
use tauri::AppHandle;
use tokio::process::{Child, Command};
use tokio::time::sleep;

pub struct SidecarHandle {
    child: Child,
}

impl SidecarHandle {
    pub fn shutdown(mut self) -> Result<()> {
        // Пытаемся аккуратно: сначала SIGTERM, потом kill если не отвалился.
        self.child.start_kill().context("kill sidecar")?;
        Ok(())
    }
}

fn free_port() -> Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").context("bind ephemeral port")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn audio_service_dir(app: &AppHandle) -> Result<std::path::PathBuf> {
    // dev: рядом с исходниками tauri; release: рядом с исполняемым файлом.
    // Пока прибиваем к dev-раскладке; переупакуем на Этапе 6.
    let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidate = manifest.join("..").join("..").join("audio-service");
    if candidate.is_dir() {
        return Ok(candidate.canonicalize()?);
    }
    // Резервный вариант — рядом с бинарём (release).
    let exe = std::env::current_exe()?;
    if let Some(parent) = exe.parent() {
        let alt = parent.join("audio-service");
        if alt.is_dir() {
            return Ok(alt);
        }
    }
    let _ = app;
    Err(anyhow!("не нашёл audio-service рядом"))
}

fn python_exe(audio_dir: &std::path::Path) -> std::path::PathBuf {
    // Предпочитаем venv из audio-service (там установлены librosa/demucs).
    let venv = audio_dir.join(".venv").join("bin").join("python");
    if venv.exists() {
        return venv;
    }
    std::path::PathBuf::from("python3")
}

pub async fn start(app: &AppHandle) -> Result<(SidecarHandle, String)> {
    let audio_dir = audio_service_dir(app)?;
    let port = free_port()?;
    let base_url = format!("http://127.0.0.1:{port}");
    let py = python_exe(&audio_dir);

    tracing::info!(?audio_dir, ?py, port, "starting python sidecar");

    let child = Command::new(&py)
        .current_dir(&audio_dir)
        .args([
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            &port.to_string(),
        ])
        .env("DATA_DIR", audio_dir.join("data"))
        .env("QUEUE_BACKEND", "inline")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .context("spawn uvicorn")?;

    let client = reqwest::Client::new();
    for attempt in 0..60 {
        sleep(Duration::from_millis(500)).await;
        if let Ok(r) = client.get(format!("{base_url}/api/health")).send().await {
            if r.status().is_success() {
                return Ok((SidecarHandle { child }, base_url));
            }
        }
        tracing::debug!(attempt, "waiting for /api/health");
    }
    Err(anyhow!("Python-служба не поднялась за 30 секунд"))
}
