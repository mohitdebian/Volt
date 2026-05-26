use regex::Regex;
use serde::{Deserialize, Serialize};

/// Risk level for a command
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RiskLevel {
    Safe,
    Low,
    Medium,
    High,
    Critical,
}

/// Result of analyzing a command for safety
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandRisk {
    pub level: RiskLevel,
    pub command: String,
    pub reason: Option<String>,
    pub requires_confirmation: bool,
    pub blocked: bool,
}

/// Dangerous command patterns with associated risk levels
struct DangerPattern {
    pattern: &'static str,
    level: RiskLevel,
    reason: &'static str,
}

const DANGER_PATTERNS: &[DangerPattern] = &[
    // CRITICAL - system-destroying commands
    DangerPattern {
        pattern: r"rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?/\s*$",
        level: RiskLevel::Critical,
        reason: "Deletes entire filesystem",
    },
    DangerPattern {
        pattern: r"rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+/",
        level: RiskLevel::Critical,
        reason: "Recursive force delete from root",
    },
    DangerPattern {
        pattern: r"mkfs\.",
        level: RiskLevel::Critical,
        reason: "Formats a filesystem/partition",
    },
    DangerPattern {
        pattern: r"dd\s+if=.*of=/dev/[sh]d",
        level: RiskLevel::Critical,
        reason: "Direct disk write - can destroy partition",
    },
    DangerPattern {
        pattern: r":\(\)\{\s*:\|:&\s*\};:",
        level: RiskLevel::Critical,
        reason: "Fork bomb - will crash the system",
    },
    DangerPattern {
        pattern: r">\s*/dev/[sh]da",
        level: RiskLevel::Critical,
        reason: "Overwrites disk device",
    },
    // HIGH - dangerous but targeted
    DangerPattern {
        pattern: r"rm\s+-[a-zA-Z]*r[a-zA-Z]*f",
        level: RiskLevel::High,
        reason: "Recursive force delete",
    },
    DangerPattern {
        pattern: r"chmod\s+-R\s+777",
        level: RiskLevel::High,
        reason: "Opens all permissions recursively",
    },
    DangerPattern {
        pattern: r"chmod\s+777",
        level: RiskLevel::High,
        reason: "Opens all permissions",
    },
    DangerPattern {
        pattern: r">\s*/etc/",
        level: RiskLevel::High,
        reason: "Overwrites system configuration file",
    },
    DangerPattern {
        pattern: r"curl\s+.*\|\s*(sudo\s+)?bash",
        level: RiskLevel::High,
        reason: "Executes remote script without review",
    },
    DangerPattern {
        pattern: r"wget\s+.*\|\s*(sudo\s+)?bash",
        level: RiskLevel::High,
        reason: "Executes remote script without review",
    },
    // MEDIUM - use with caution
    DangerPattern {
        pattern: r"^sudo\s+",
        level: RiskLevel::Medium,
        reason: "Runs with elevated privileges",
    },
    DangerPattern {
        pattern: r"rm\s+-[a-zA-Z]*r",
        level: RiskLevel::Medium,
        reason: "Recursive delete",
    },
    DangerPattern {
        pattern: r"git\s+push\s+.*--force",
        level: RiskLevel::Medium,
        reason: "Force push overwrites remote history",
    },
    DangerPattern {
        pattern: r"git\s+reset\s+--hard",
        level: RiskLevel::Medium,
        reason: "Hard reset discards uncommitted changes",
    },
    DangerPattern {
        pattern: r"docker\s+system\s+prune",
        level: RiskLevel::Medium,
        reason: "Removes all unused Docker resources",
    },
    // LOW - generally safe but worth noting
    DangerPattern {
        pattern: r"kill\s+-9",
        level: RiskLevel::Low,
        reason: "Force kills a process",
    },
    DangerPattern {
        pattern: r"pkill",
        level: RiskLevel::Low,
        reason: "Kills processes by name",
    },
];

/// Analyze a command for potential risks
pub fn analyze_command(command: &str) -> CommandRisk {
    let trimmed = command.trim();

    for pattern_def in DANGER_PATTERNS {
        if let Ok(re) = Regex::new(pattern_def.pattern) {
            if re.is_match(trimmed) {
                let level = pattern_def.level.clone();
                return CommandRisk {
                    level: level.clone(),
                    command: trimmed.to_string(),
                    reason: Some(pattern_def.reason.to_string()),
                    requires_confirmation: matches!(level, RiskLevel::Medium | RiskLevel::High | RiskLevel::Critical),
                    blocked: matches!(level, RiskLevel::Critical),
                };
            }
        }
    }

    CommandRisk {
        level: RiskLevel::Safe,
        command: trimmed.to_string(),
        reason: None,
        requires_confirmation: false,
        blocked: false,
    }
}
