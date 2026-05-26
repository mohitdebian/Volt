use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

/// Lightweight per-project memory system backed by SQLite
pub struct MemoryDb {
    conn: Connection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandRecord {
    pub id: i64,
    pub project_path: String,
    pub command: String,
    pub frequency: i32,
    pub last_used_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMemoryRecord {
    pub id: i64,
    pub project_path: String,
    pub query: String,
    pub response: String,
    pub created_at: i64,
}

impl MemoryDb {
    /// Open or create the database at the given path
    pub fn open(db_path: &str) -> Result<Self, String> {
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open DB: {}", e))?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .map_err(|e| format!("Failed to set pragmas: {}", e))?;

        // Create tables if they don't exist
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS command_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_path TEXT NOT NULL,
                command TEXT NOT NULL,
                frequency INTEGER DEFAULT 1,
                last_used_at INTEGER NOT NULL,
                tags TEXT
            );

            CREATE TABLE IF NOT EXISTS ai_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_path TEXT NOT NULL,
                query TEXT NOT NULL,
                response TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_context (
                project_path TEXT PRIMARY KEY,
                context_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_cmd_project ON command_history(project_path);
            CREATE INDEX IF NOT EXISTS idx_cmd_freq ON command_history(frequency DESC);
            CREATE INDEX IF NOT EXISTS idx_ai_project ON ai_memory(project_path);",
        )
        .map_err(|e| format!("Failed to create tables: {}", e))?;

        Ok(Self { conn })
    }

    /// Save a command execution, incrementing frequency if it already exists
    pub fn save_command(&self, project_path: &str, command: &str) -> Result<(), String> {
        let now = chrono::Utc::now().timestamp();

        // Try to update existing command frequency
        let updated = self.conn.execute(
            "UPDATE command_history SET frequency = frequency + 1, last_used_at = ?1
             WHERE project_path = ?2 AND command = ?3",
            params![now, project_path, command],
        ).map_err(|e| format!("DB error: {}", e))?;

        if updated == 0 {
            // Insert new command
            self.conn.execute(
                "INSERT INTO command_history (project_path, command, frequency, last_used_at)
                 VALUES (?1, ?2, 1, ?3)",
                params![project_path, command, now],
            ).map_err(|e| format!("DB error: {}", e))?;
        }

        Ok(())
    }

    /// Get the most frequently used commands for a project
    pub fn get_frequent_commands(&self, project_path: &str, limit: usize) -> Result<Vec<CommandRecord>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id, project_path, command, frequency, last_used_at
             FROM command_history
             WHERE project_path = ?1
             ORDER BY frequency DESC, last_used_at DESC
             LIMIT ?2"
        ).map_err(|e| format!("DB error: {}", e))?;

        let records = stmt.query_map(params![project_path, limit as i64], |row| {
            Ok(CommandRecord {
                id: row.get(0)?,
                project_path: row.get(1)?,
                command: row.get(2)?,
                frequency: row.get(3)?,
                last_used_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("DB error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

        Ok(records)
    }

    /// Save an AI conversation for future reference
    pub fn save_ai_memory(&self, project_path: &str, query: &str, response: &str) -> Result<(), String> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT INTO ai_memory (project_path, query, response, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![project_path, query, response, now],
        ).map_err(|e| format!("DB error: {}", e))?;

        // Keep only last 100 entries per project to limit DB size
        self.conn.execute(
            "DELETE FROM ai_memory WHERE id NOT IN (
                SELECT id FROM ai_memory WHERE project_path = ?1
                ORDER BY created_at DESC LIMIT 100
            ) AND project_path = ?1",
            params![project_path],
        ).map_err(|e| format!("DB error: {}", e))?;

        Ok(())
    }

    /// Get recent AI conversations for a project
    pub fn get_ai_memory(&self, project_path: &str, limit: usize) -> Result<Vec<AiMemoryRecord>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id, project_path, query, response, created_at
             FROM ai_memory
             WHERE project_path = ?1
             ORDER BY created_at DESC
             LIMIT ?2"
        ).map_err(|e| format!("DB error: {}", e))?;

        let records = stmt.query_map(params![project_path, limit as i64], |row| {
            Ok(AiMemoryRecord {
                id: row.get(0)?,
                project_path: row.get(1)?,
                query: row.get(2)?,
                response: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("DB error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

        Ok(records)
    }

    /// Save project context cache
    pub fn save_project_context(&self, project_path: &str, context_json: &str) -> Result<(), String> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT OR REPLACE INTO project_context (project_path, context_json, updated_at)
             VALUES (?1, ?2, ?3)",
            params![project_path, context_json, now],
        ).map_err(|e| format!("DB error: {}", e))?;
        Ok(())
    }
}

pub type SharedMemoryDb = Arc<Mutex<MemoryDb>>;

pub fn create_memory_db(app_data_dir: &str) -> Result<SharedMemoryDb, String> {
    let db_path = format!("{}/volt_memory.db", app_data_dir);
    // Ensure directory exists
    std::fs::create_dir_all(app_data_dir)
        .map_err(|e| format!("Failed to create data dir: {}", e))?;
    let db = MemoryDb::open(&db_path)?;
    Ok(Arc::new(Mutex::new(db)))
}
