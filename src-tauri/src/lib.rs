#![allow(dead_code)]
mod ai;
mod memory;
mod security;
mod shell;
mod system;

use ai::{ChatMessage, NimClient, NimConfig, TerminalContext};
use memory::{create_memory_db, AiMemoryRecord, CommandRecord, SharedMemoryDb};
use security::{analyze_command, CommandRisk};
use shell::{create_pty_manager, SharedPtyManager};
use system::get_system_status;

use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

/// Application state managed by Tauri
pub struct AppState {
    pty_manager: SharedPtyManager,
    nim_client: Arc<Mutex<NimClient>>,
    memory_db: SharedMemoryDb,
}

// ─── PTY Commands ───────────────────────────────────────────────

#[tauri::command]
fn spawn_pty(
    app: AppHandle,
    state: State<'_, AppState>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<String, String> {
    let mut manager = state
        .pty_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    manager.spawn(app, cols, rows, cwd)
}

#[tauri::command]
fn write_pty(state: State<'_, AppState>, session_id: String, data: String) -> Result<(), String> {
    let mut manager = state
        .pty_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    manager.write(&session_id, &data)
}

#[tauri::command]
fn resize_pty(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut manager = state
        .pty_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    manager.resize(&session_id, cols, rows)
}

#[tauri::command]
fn kill_pty(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let mut manager = state
        .pty_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    manager.kill(&session_id)
}

// ─── AI Commands ────────────────────────────────────────────────

#[tauri::command]
async fn ai_ask(
    app: AppHandle,
    state: State<'_, AppState>,
    query: String,
    cwd: String,
    mode: String,
    request_id: String,
    terminal_output: Option<String>,
) -> Result<String, String> {
    let mut context = TerminalContext::gather(&cwd);
    if let Some(out) = terminal_output {
        if !out.trim().is_empty() {
            context.terminal_history = Some(out);
        }
    }
    let prompt_context = context.to_prompt_context();

    let system_prompt = match mode.as_str() {
        "command" => ai::prompts::command_generation_prompt(
            &context.os,
            &context.shell,
            &cwd,
            &prompt_context,
        ),
        "debug" => {
            ai::prompts::debug_prompt(&context.os, &context.shell, &cwd, &prompt_context)
        }
        "explain" => ai::prompts::explain_prompt().to_string(),
        "git" => {
            let branch = context.git_branch.as_deref().unwrap_or("unknown");
            let status = context.git_status.as_deref().unwrap_or("unknown");
            ai::prompts::git_prompt(branch, status)
        }
        "docker" => ai::prompts::docker_prompt(&prompt_context),
        "troubleshoot" => ai::prompts::troubleshoot_prompt(&context.os, &prompt_context),
        "summarize" => ai::prompts::summarize_prompt(&prompt_context),
        _ => ai::prompts::command_generation_prompt(
            &context.os,
            &context.shell,
            &cwd,
            &prompt_context,
        ),
    };

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: system_prompt,
        },
        ChatMessage {
            role: "user".to_string(),
            content: query.clone(),
        },
    ];
    // Extract config synchronously (before any .await)
    let config = {
        let client = state
            .nim_client
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        client.config.clone()
    }; // MutexGuard dropped here

    eprintln!("[Volt AI] request_id={}, mode={}, cwd={}", request_id, mode, cwd);
    eprintln!("[Volt AI] config: model={}, base_url={}, api_key_len={}", 
        config.model, config.base_url, config.api_key.len());
    eprintln!("[Volt AI] terminal_history present: {}", context.terminal_history.is_some());

    if config.api_key.is_empty() {
        return Err("API key not configured. Open Settings (Ctrl+,) and enter your NVIDIA NIM API key.".to_string());
    }

    let memory_db = state.memory_db.clone();

    let nim = NimClient::new(config);
    let result = nim.stream_completion(&app, &request_id, messages).await?;

    eprintln!("[Volt AI] Got response ({} chars): {:?}", result.len(), result);

    // Save to memory (non-critical, ignore errors)
    if let Ok(db) = memory_db.lock() {
        let _ = db.save_ai_memory(&cwd, &query, &result);
    }

    Ok(result)
}

#[tauri::command]
fn analyze_command_risk(command: String) -> CommandRisk {
    analyze_command(&command)
}

#[tauri::command]
fn update_nim_config(state: State<'_, AppState>, config: NimConfig) -> Result<(), String> {
    let mut client = state
        .nim_client
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    client.update_config(config);
    Ok(())
}

#[tauri::command]
fn get_nim_config(state: State<'_, AppState>) -> Result<NimConfig, String> {
    let client = state
        .nim_client
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    Ok(client.config.clone())
}

// ─── Memory Commands ────────────────────────────────────────────

#[tauri::command]
fn save_command(
    state: State<'_, AppState>,
    project_path: String,
    command: String,
) -> Result<(), String> {
    let db = state
        .memory_db
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    db.save_command(&project_path, &command)
}

#[tauri::command]
fn get_frequent_commands(
    state: State<'_, AppState>,
    project_path: String,
    limit: usize,
) -> Result<Vec<CommandRecord>, String> {
    let db = state
        .memory_db
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    db.get_frequent_commands(&project_path, limit)
}

#[tauri::command]
fn get_ai_memory(
    state: State<'_, AppState>,
    project_path: String,
    limit: usize,
) -> Result<Vec<AiMemoryRecord>, String> {
    let db = state
        .memory_db
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    db.get_ai_memory(&project_path, limit)
}

// ─── System Commands ────────────────────────────────────────────

#[tauri::command]
fn get_system_info() -> system::SystemStatus {
    get_system_status()
}

#[tauri::command]
fn get_context(cwd: String) -> TerminalContext {
    TerminalContext::gather(&cwd)
}

// ─── App Entry Point ────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Initialize memory DB in app data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))
                .unwrap_or_else(|_| std::path::PathBuf::from("/tmp/volt"));

            let data_dir_str = app_data_dir.to_string_lossy().to_string();

            let memory_db = create_memory_db(&data_dir_str)
                .expect("Failed to initialize memory database");

            let nim_client = Arc::new(Mutex::new(NimClient::new(NimConfig::default())));
            let pty_manager = create_pty_manager();

            app.manage(AppState {
                pty_manager,
                nim_client,
                memory_db,
            });

            // Emit initial system status
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    let status = get_system_status();
                    let _ = handle.emit("system-status", &status);
                    std::thread::sleep(std::time::Duration::from_secs(5));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // PTY
            spawn_pty,
            write_pty,
            resize_pty,
            kill_pty,
            // AI
            ai_ask,
            analyze_command_risk,
            update_nim_config,
            get_nim_config,
            // Memory
            save_command,
            get_frequent_commands,
            get_ai_memory,
            // System
            get_system_info,
            get_context,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Volt");
}
