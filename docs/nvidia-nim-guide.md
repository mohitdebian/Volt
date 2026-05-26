# NVIDIA NIM Integration Guide

## Overview

NexTerm uses NVIDIA NIM (NVIDIA Inference Microservices) for all AI capabilities. NIM provides an OpenAI-compatible API, which means the same code works with:

- NVIDIA's hosted cloud endpoints
- Self-hosted NIM containers on your own GPU
- Any OpenAI-compatible API (OpenAI, Ollama, LM Studio, etc.)

## Getting an API Key

1. Visit [build.nvidia.com](https://build.nvidia.com)
2. Sign up or log in
3. Navigate to any model page
4. Click "Get API Key"
5. Your key will start with `nvapi-`

## Configuration

### Via Settings UI
1. Press `Ctrl+,` in NexTerm
2. Enter your API key
3. Select a model
4. Adjust temperature (0.0 = deterministic, 1.0 = creative)
5. Click Save

### Default Configuration
```json
{
  "api_key": "",
  "base_url": "https://integrate.api.nvidia.com/v1",
  "model": "meta/llama-3.1-8b-instruct",
  "temperature": 0.3,
  "max_tokens": 2048
}
```

## Using with Self-Hosted NIM

If you're running NIM on your own GPU:

1. Pull and run the NIM container:
   ```bash
   docker run -d --gpus all -p 8000:8000 nvcr.io/nim/meta/llama-3.1-8b-instruct:latest
   ```

2. In NexTerm settings, change Base URL to:
   ```
   http://localhost:8000/v1
   ```

3. The API key can be any non-empty string for self-hosted

## Using with Other Providers

Since NexTerm uses the OpenAI-compatible format, you can point it at:

- **OpenAI**: `https://api.openai.com/v1` with your OpenAI key
- **Ollama**: `http://localhost:11434/v1` with any key
- **LM Studio**: `http://localhost:1234/v1` with any key

## How AI Modes Work

### Command Mode
System prompt instructs the model to convert natural language to shell commands. Context (CWD, git info, OS) is injected automatically.

### Debug Mode
The model analyzes error output from the terminal and provides fixes. The last error output is included in the prompt.

### Explain Mode
Breaks down a command or code snippet into understandable parts.

### Git/Docker Modes
Specialized prompts with relevant context (branch, status, Dockerfile presence).

## API Format

All requests use the standard OpenAI chat completions format:

```json
POST /v1/chat/completions
{
  "model": "meta/llama-3.1-8b-instruct",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "find large files"}
  ],
  "stream": true,
  "temperature": 0.3,
  "max_tokens": 2048
}
```

Streaming responses use Server-Sent Events (SSE):
```
data: {"choices":[{"delta":{"content":"find"}}]}
data: {"choices":[{"delta":{"content":" ."}}]}
data: [DONE]
```

## Troubleshooting

- **401 Unauthorized**: Check your API key is correct and starts with `nvapi-`
- **429 Rate Limited**: You've exceeded the free tier. Wait or upgrade
- **Timeout**: The model may be cold-starting. Try again in 30 seconds
- **Empty response**: Check the model name is exactly right (case-sensitive)
