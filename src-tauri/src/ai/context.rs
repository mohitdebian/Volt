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
    pub git_diff_summary: Option<String>,
    pub git_uncommitted_diff: Option<String>,
    pub git_log: Option<String>,
    pub project_type: Option<String>,
    pub file_tree: Option<String>,
    pub environment: Option<String>,
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
        let git_diff_summary = get_git_diff_summary(cwd);
        let git_uncommitted_diff = get_git_uncommitted_diff(cwd);
        let git_log = get_git_log(cwd);
        let project_type = detect_project_type(cwd);
        let file_tree = get_file_tree(cwd);
        let environment = detect_environment();

        Self {
            os,
            shell,
            cwd: cwd.to_string(),
            git_branch,
            git_status,
            git_diff_summary,
            git_uncommitted_diff,
            git_log,
            project_type,
            file_tree,
            environment,
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
        if let Some(ref status) = self.git_status {
            parts.push(format!("- Git status:\n{}", status));
        }
        if let Some(ref diff) = self.git_diff_summary {
            parts.push(format!("- Last commit changes:\n{}", diff));
        }
        if let Some(ref log) = self.git_log {
            parts.push(format!("- Recent commits:\n{}", log));
        }
        if let Some(ref diff) = self.git_uncommitted_diff {
            parts.push(format!("- Uncommitted changes (git diff):\n```diff\n{}\n```", diff));
        }
        if let Some(ref project) = self.project_type {
            parts.push(format!("- Project type: {}", project));
        }
        if let Some(ref tree) = self.file_tree {
            parts.push(format!("- Project file tree:\n```\n{}\n```", tree));
        }
        if let Some(ref env) = self.environment {
            parts.push(format!("- Available tools: {}", env));
        }
        if !self.recent_commands.is_empty() {
            let recent = self.recent_commands.iter().rev().take(5).cloned().collect::<Vec<_>>().join(", ");
            parts.push(format!("- Recent commands: {}", recent));
        }
        if let Some(ref err) = self.last_error {
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
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("uname").arg("-sr").output();
        if let Ok(o) = output {
            let kernel = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !kernel.is_empty() {
                return format!("{} ({})", kernel, arch);
            }
        }
    }

    format!("{} {}", os, arch)
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
            Some("clean (no uncommitted changes)".to_string())
        } else {
            // Show actual changed files (truncated to 15 lines max)
            let lines: Vec<&str> = status.lines().take(15).collect();
            let result = lines.join("\n");
            let total = status.lines().count();
            if total > 15 {
                Some(format!("{}\n... and {} more files", result, total - 15))
            } else {
                Some(result)
            }
        }
    } else {
        None
    }
}

/// Get a summary of recent git changes (diffstat)
fn get_git_diff_summary(cwd: &str) -> Option<String> {
    let output = Command::new("git")
        .args(["diff", "--stat", "HEAD~1..HEAD"])
        .current_dir(cwd)
        .output()
        .ok()?;

    if output.status.success() {
        let diff = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if diff.is_empty() {
            None
        } else {
            let lines: Vec<&str> = diff.lines().collect();
            let start = if lines.len() > 10 { lines.len() - 10 } else { 0 };
            Some(lines[start..].join("\n"))
        }
    } else {
        None
    }
}

/// Get the actual uncommitted diff (staged + unstaged)
fn get_git_uncommitted_diff(cwd: &str) -> Option<String> {
    let mut diff = Command::new("git")
        .args(["diff", "--cached"])
        .current_dir(cwd)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();
        
    let unstaged = Command::new("git")
        .args(["diff"])
        .current_dir(cwd)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();
        
    diff.push_str(&unstaged);

    let trimmed = diff.trim();
    if trimmed.is_empty() {
        return None;
    }
    
    // Truncate to avoid massive token usage on huge diffs (max ~8000 chars)
    if trimmed.len() > 8000 {
        Some(format!("{}\n...[Diff truncated due to length]", &trimmed[..8000]))
    } else {
        Some(trimmed.to_string())
    }
}

/// Get recent commit history
fn get_git_log(cwd: &str) -> Option<String> {
    let output = Command::new("git")
        .args(["log", "--oneline", "-n", "5"])
        .current_dir(cwd)
        .output()
        .ok()?;

    if output.status.success() {
        let log = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if log.is_empty() { None } else { Some(log) }
    } else {
        None
    }
}

/// Lightweight file tree scanner (respects .gitignore via git ls-files)
fn get_file_tree(cwd: &str) -> Option<String> {
    // Try using `git ls-files` first (respects .gitignore, much cleaner)
    let output = Command::new("git")
        .args(["ls-files", "--cached", "--others", "--exclude-standard"])
        .current_dir(cwd)
        .output()
        .ok();

    if let Some(o) = output {
        if o.status.success() {
            let files = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !files.is_empty() {
                let lines: Vec<&str> = files.lines().take(60).collect();
                let total = files.lines().count();
                let mut result = lines.join("\n");
                if total > 60 {
                    result.push_str(&format!("\n... and {} more files", total - 60));
                }
                return Some(result);
            }
        }
    }

    // Fallback: manual scan (depth 2, skip hidden dirs and node_modules)
    let path = std::path::Path::new(cwd);
    let mut entries = Vec::new();
    scan_dir(path, path, 0, 2, &mut entries);
    if entries.is_empty() {
        None
    } else {
        entries.truncate(60);
        Some(entries.join("\n"))
    }
}

fn scan_dir(
    base: &std::path::Path,
    dir: &std::path::Path,
    depth: usize,
    max_depth: usize,
    entries: &mut Vec<String>,
) {
    if depth > max_depth || entries.len() >= 60 {
        return;
    }

    let Ok(read_dir) = std::fs::read_dir(dir) else {
        return;
    };

    let skip_dirs = [
        "node_modules", ".git", "target", "__pycache__",
        ".next", "dist", "build", ".venv",
    ];

    for entry in read_dir.flatten() {
        if entries.len() >= 60 {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files (except useful config files)
        if name.starts_with('.') && name != ".env" && name != ".gitignore" {
            continue;
        }
        if skip_dirs.contains(&name.as_str()) {
            continue;
        }

        let rel = entry
            .path()
            .strip_prefix(base)
            .unwrap_or(entry.path().as_path())
            .to_string_lossy()
            .to_string();

        if entry.path().is_dir() {
            entries.push(format!("{}/", rel));
            scan_dir(base, &entry.path(), depth + 1, max_depth, entries);
        } else {
            entries.push(rel);
        }
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

/// Detect available development tools/runtimes on the system
fn detect_environment() -> Option<String> {
    let tools = [
        ("node", "--version"),
        ("npm", "--version"),
        ("python3", "--version"),
        ("cargo", "--version"),
        ("go", "version"),
        ("docker", "--version"),
    ];

    let mut found = Vec::new();
    for (cmd, flag) in &tools {
        if let Ok(output) = Command::new(cmd).arg(flag).output() {
            if output.status.success() {
                let ver = String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .to_string();
                let short = ver.lines().next().unwrap_or(&ver);
                found.push(format!("{} ({})", cmd, short));
            }
        }
    }

    if found.is_empty() {
        None
    } else {
        Some(found.join(", "))
    }
}
