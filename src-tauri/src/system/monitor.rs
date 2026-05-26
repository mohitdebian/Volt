use serde::{Deserialize, Serialize};
use std::fs;

/// System resource snapshot emitted to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStatus {
    pub ram_usage_mb: f64,
    pub gpu_available: bool,
    pub gpu_name: Option<String>,
}

/// Get current process RAM usage (Linux only, uses /proc/self/status)
pub fn get_ram_usage_mb() -> f64 {
    if let Ok(contents) = fs::read_to_string("/proc/self/status") {
        for line in contents.lines() {
            if line.starts_with("VmRSS:") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    if let Ok(kb) = parts[1].parse::<f64>() {
                        return kb / 1024.0;
                    }
                }
            }
        }
    }
    0.0
}

/// Check if NVIDIA GPU is available
pub fn check_gpu() -> (bool, Option<String>) {
    let output = std::process::Command::new("nvidia-smi")
        .arg("--query-gpu=name")
        .arg("--format=csv,noheader,nounits")
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let name = String::from_utf8_lossy(&o.stdout).trim().to_string();
            (true, Some(name))
        }
        _ => (false, None),
    }
}

/// Get full system status
pub fn get_system_status() -> SystemStatus {
    let ram = get_ram_usage_mb();
    let (gpu_available, gpu_name) = check_gpu();

    SystemStatus {
        ram_usage_mb: ram,
        gpu_available,
        gpu_name,
    }
}
