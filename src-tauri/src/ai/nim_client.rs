use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// OpenAI-compatible message format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// OpenAI-compatible request body
#[derive(Debug, Serialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
}

/// SSE streaming delta chunk
#[derive(Debug, Deserialize)]
pub struct StreamChoice {
    pub delta: StreamDelta,
    #[serde(default)]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StreamDelta {
    #[serde(default)]
    pub content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StreamChunk {
    pub choices: Vec<StreamChoice>,
}

/// Non-streaming response
#[derive(Debug, Deserialize)]
pub struct ChatCompletionResponse {
    pub choices: Vec<CompletionChoice>,
}

#[derive(Debug, Deserialize)]
pub struct CompletionChoice {
    pub message: ChatMessage,
}

/// NIM client configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NimConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
}

impl Default for NimConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: "https://integrate.api.nvidia.com/v1".to_string(),
            model: "meta/llama-3.1-8b-instruct".to_string(),
            temperature: 0.3,
            max_tokens: 2048,
        }
    }
}

/// NVIDIA NIM API client
pub struct NimClient {
    http: Client,
    pub config: NimConfig,
}

impl NimClient {
    pub fn new(config: NimConfig) -> Self {
        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .expect("Failed to create HTTP client");

        Self { http, config }
    }

    pub fn update_config(&mut self, config: NimConfig) {
        self.config = config;
    }

    /// Send a streaming chat completion request, emitting chunks via Tauri events
    pub async fn stream_completion(
        &self,
        app: &AppHandle,
        request_id: &str,
        messages: Vec<ChatMessage>,
    ) -> Result<String, String> {
        if self.config.api_key.is_empty() {
            return Err("API key not configured. Please set your NVIDIA NIM API key in Settings.".to_string());
        }

        let url = format!("{}/chat/completions", self.config.base_url);
        let body = ChatCompletionRequest {
            model: self.config.model.clone(),
            messages,
            stream: true,
            temperature: Some(self.config.temperature),
            max_tokens: Some(self.config.max_tokens),
        };

        let response = self
            .http
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("Content-Type", "application/json")
            .header("Accept", "text/event-stream")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(format!("NIM API error ({}): {}", status, error_body));
        }

        let mut full_response = String::new();
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
            let text = String::from_utf8_lossy(&chunk);
            buffer.push_str(&text);

            // Process complete SSE lines from buffer
            while let Some(line_end) = buffer.find('\n') {
                let line = buffer[..line_end].trim().to_string();
                buffer = buffer[line_end + 1..].to_string();

                if line.starts_with("data: ") {
                    let data = &line["data: ".len()..];
                    if data == "[DONE]" {
                        let _ = app.emit(
                            &format!("ai-done-{}", request_id),
                            full_response.clone(),
                        );
                        return Ok(full_response);
                    }

                    if let Ok(chunk) = serde_json::from_str::<StreamChunk>(data) {
                        for choice in &chunk.choices {
                            if let Some(content) = &choice.delta.content {
                                full_response.push_str(content);
                                let _ = app.emit(&format!("ai-chunk-{}", request_id), content.clone());
                            }
                        }
                    }
                } else if !line.is_empty() {
                    // Fallback for non-SSE JSON streams like Ollama
                    if let Ok(chunk) = serde_json::from_str::<serde_json::Value>(&line) {
                        if let Some(msg) = chunk.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                            full_response.push_str(msg);
                            let _ = app.emit(&format!("ai-chunk-{}", request_id), msg.to_string());
                        }
                    }
                }
            }
        }

        let _ = app.emit(
            &format!("ai-done-{}", request_id),
            full_response.clone(),
        );
        Ok(full_response)
    }

    /// Non-streaming completion (for quick queries like command classification)
    pub async fn complete(
        &self,
        messages: Vec<ChatMessage>,
    ) -> Result<String, String> {
        if self.config.api_key.is_empty() {
            return Err("API key not configured".to_string());
        }

        let url = format!("{}/chat/completions", self.config.base_url);
        let body = ChatCompletionRequest {
            model: self.config.model.clone(),
            messages,
            stream: false,
            temperature: Some(self.config.temperature),
            max_tokens: Some(self.config.max_tokens),
        };

        let response = self
            .http
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(format!("NIM API error ({}): {}", status, error_body));
        }

        let result: ChatCompletionResponse = response
            .json()
            .await
            .map_err(|e| format!("JSON parse error: {}", e))?;

        result
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .ok_or_else(|| "Empty response from NIM".to_string())
    }
}
