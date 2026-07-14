// Rust-shell приложения. Спавнит Python-sidecar (наш FastAPI из ../audio-service)
// на свободном локальном порту, ждёт /api/health и отдаёт URL во frontend.
// Панели Synthesia/аудиоредактора будут отдельными Rust-командами позже.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod python_sidecar;

use anyhow::Result;
use std::sync::Mutex;
use tauri::Manager;

struct SidecarState {
    child: Mutex<Option<python_sidecar::SidecarHandle>>,
    base_url: Mutex<Option<String>>,
}

#[tauri::command]
async fn service_url(state: tauri::State<'_, SidecarState>) -> Result<String, String> {
    if let Some(url) = state.base_url.lock().unwrap().clone() {
        return Ok(url);
    }
    Err("Служба ещё не готова".into())
}

fn main() {
    tracing_subscriber::fmt().with_env_filter("info").try_init().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState {
            child: Mutex::new(None),
            base_url: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![service_url])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match python_sidecar::start(&handle).await {
                    Ok((child, url)) => {
                        let state = handle.state::<SidecarState>();
                        *state.child.lock().unwrap() = Some(child);
                        *state.base_url.lock().unwrap() = Some(url);
                        tracing::info!("service ready");
                    }
                    Err(err) => {
                        tracing::error!(?err, "failed to start python sidecar");
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<SidecarState>();
                if let Some(child) = state.child.lock().unwrap().take() {
                    let _ = child.shutdown();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
