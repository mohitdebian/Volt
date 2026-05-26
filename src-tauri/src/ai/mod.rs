pub mod nim_client;
pub mod prompts;
pub mod context;

pub use nim_client::{NimClient, NimConfig, ChatMessage};
pub use context::TerminalContext;
