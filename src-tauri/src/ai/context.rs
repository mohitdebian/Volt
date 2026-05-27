use serde::{Deserialize, Serialize};
use std::process::Command;

/// Terminal context gathered for AI prompt enrichment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalContext {
    pub os: String,
    pub shell: String,
    pub cwd: String,
    pub git_branch: Option<String>,
    pub git_status: Option<String>,
    pub project_type: Option<String>,
    pub recent_commands: Vec<String>,
    pub last_error: Option<String>,
    pub terminal_history: Option<String>,
}

impl TerminalContext {
    /// Gather context from the current working directory
    pub fn gather(cwd: &str) -> Self {
        let os = get_os_info();
        let shell = if cfg!(target_os = "windows") {
            std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string())
        };
        let git_branch = get_git_branch(cwd);
        let git_status = get_git_status(cwd);
        let project_type = detect_project_type(cwd);

        Self {
            os,
            shell,
            cwd: cwd.to_string(),
            git_branch,
            git_status,
            project_type,
            recent_commands: Vec::new(),
            last_error: None,
            terminal_history: None,
        }
    }

    /// Format context as a string for injection into AI prompts
    pub fn to_prompt_context(&self) -> String {
        let mut parts = Vec::new();

        if let Some(ref branch) = self.git_branch {
            parts.push(format!("- Git branch: {}", branch));
        }
        if let Some(ref project) = self.project_type {
            parts.push(format!("- Project type: {}", project));
        }
        if !self.recent_commands.is_empty() {
            let recent = self.recent_commands.iter().rev().take(5).cloned().collect::<Vec<_>>().join(", ");
            parts.push(format!("- Recent commands: {}", recent));
        }
        if let Some(ref err) = self.last_error {
            // Truncate error to avoid huge prompts
            let truncated = if err.len() > 500 { &err[..500] } else { err };
            parts.push(format!("- Last error:\n{}", truncated));
        }
        if let Some(ref hist) = self.terminal_history {
            parts.push(format!("- Recent terminal output (for context):\n```\n{}\n```", hist));
        }

        if parts.is_empty() {
            String::new()
        } else {
            format!("\nAdditional context:\n{}", parts.join("\n"))
        }
    }
}

fn get_os_info() -> String {
    let output = Command::new("uname").arg("-sr").output();
    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        Err(_) => "Linux".to_string(),
    }
}

fn get_git_branch(cwd: &str) -> Option<String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(cwd)
        .output()
        .ok()?;

    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

fn get_git_status(cwd: &str) -> Option<String> {
    let output = Command::new("git")
        .args(["status", "--short"])
        .current_dir(cwd)
        .output()
        .ok()?;

    if output.status.success() {
        let status = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if status.is_empty() {
            Some("clean".to_string())
        } else {
            // Just count changes to keep context small
            let lines: Vec<&str> = status.lines().collect();
            Some(format!("{} changed files", lines.len()))
        }
    } else {
        None
    }
}

fn detect_project_type(cwd: &str) -> Option<String> {
    use std::path::Path;
    let path = Path::new(cwd);

    let markers = [
        ("package.json", "Node.js"),
        ("Cargo.toml", "Rust"),
        ("pyproject.toml", "Python"),
        ("requirements.txt", "Python"),
        ("go.mod", "Go"),
        ("pom.xml", "Java/Maven"),
        ("build.gradle", "Java/Gradle"),
        ("Dockerfile", "Docker"),
        ("docker-compose.yml", "Docker Compose"),
        ("docker-compose.yaml", "Docker Compose"),
        ("Makefile", "Make"),
        ("CMakeLists.txt", "C/C++ CMake"),
        ("Gemfile", "Ruby"),
        ("mix.exs", "Elixir"),
    ];

    let mut types = Vec::new();
    for (file, kind) in &markers {
        if path.join(file).exists() {
            types.push(*kind);
        }
    }

    if types.is_empty() {
        None
    } else {
        Some(types.join(", "))
    }
}
