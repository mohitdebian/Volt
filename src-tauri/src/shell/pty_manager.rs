use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{BufReader, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// Represents a single PTY session (one terminal tab/pane)
pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
    pub cols: u16,
    pub rows: u16,
}

/// Global PTY manager holding all active sessions
pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    /// Spawn a new PTY session, returns session ID
    pub fn spawn(
        &mut self,
        app: AppHandle,
        cols: u16,
        rows: u16,
        cwd: Option<String>,
    ) -> Result<String, String> {
        let pty_system = native_pty_system();
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        // Auto-detect default shell (platform-aware)
        let shell = if cfg!(target_os = "windows") {
            std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        };

        let mut cmd = CommandBuilder::new(&shell);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        if let Some(dir) = cwd {
            cmd.cwd(dir);
        } else {
            // Use the platform-appropriate home directory variable
            let home_key = if cfg!(target_os = "windows") { "USERPROFILE" } else { "HOME" };
            if let Ok(home) = std::env::var(home_key) {
                cmd.cwd(home);
            }
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        let session_id = Uuid::new_v4().to_string();
        let sid = session_id.clone();

        // Spawn async reader thread that streams PTY output to frontend
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let mut buf_reader = BufReader::with_capacity(8192, reader);
            let mut buffer = vec![0u8; 8192];
            loop {
                match std::io::Read::read(&mut buf_reader, &mut buffer) {
                    Ok(0) => {
                        // PTY closed
                        let _ = app_clone.emit(&format!("pty-exit-{}", sid), ());
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                        let _ = app_clone.emit(&format!("pty-output-{}", sid), data);
                    }
                    Err(e) => {
                        log::error!("PTY read error for {}: {}", sid, e);
                        let _ = app_clone.emit(&format!("pty-exit-{}", sid), ());
                        break;
                    }
                }
            }
        });

        self.sessions.insert(
            session_id.clone(),
            PtySession {
                master: pair.master,
                writer,
                _child: child,
                cols,
                rows,
            },
        );

        Ok(session_id)
    }

    /// Write data to a PTY session (user input)
    pub fn write(&mut self, session_id: &str, data: &str) -> Result<(), String> {
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;

        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Write error: {}", e))?;

        session
            .writer
            .flush()
            .map_err(|e| format!("Flush error: {}", e))?;

        Ok(())
    }

    /// Resize a PTY session
    pub fn resize(&mut self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;

        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize error: {}", e))?;

        session.cols = cols;
        session.rows = rows;
        Ok(())
    }

    /// Kill a PTY session
    pub fn kill(&mut self, session_id: &str) -> Result<(), String> {
        self.sessions
            .remove(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;
        // Dropping the session will close the PTY
        Ok(())
    }

    /// List all active session IDs
    pub fn list_sessions(&self) -> Vec<String> {
        self.sessions.keys().cloned().collect()
    }
}

/// Thread-safe wrapper for PtyManager
pub type SharedPtyManager = Arc<Mutex<PtyManager>>;

pub fn create_pty_manager() -> SharedPtyManager {
    Arc::new(Mutex::new(PtyManager::new()))
}
