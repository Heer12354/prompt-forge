
# ⚡ Prompt Forge

> A Chrome/Arc extension that injects a live AI prompt copilot into Claude, ChatGPT, and Gemini — right next to the input box.

![Version](https://img.shields.io/badge/version-0.1.0-blue?style=flat-square)
![Manifest](https://img.shields.io/badge/manifest-v3-green?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)
![Browsers](https://img.shields.io/badge/browser-Chrome%20%7C%20Arc-orange?style=flat-square)

---

## What is Prompt Forge?

Prompt Forge solves a real problem: **writing good prompts is hard, and switching between AI tools is slow**.

It injects a tiny floating toolbar directly into the input box of Claude, ChatGPT, and Gemini. You type your rough idea, hit a button, and the extension rewrites, coaches, or archives your prompt — all without leaving the page.

### Toolbar Buttons

| Button | What it does |
|--------|-------------|
| **Refine++** | Rebuilds your prompt with role, objective, constraints, output format, and acceptance checks |
| **Refine** | Rewrites the current prompt cleanly |
| **Coach** | Shows improvement notes without changing the prompt |
| **Keep** | Saves the prompt to your local vault |
| **Vault** | Opens the saved prompt panel |

---

## Demo

(<img width="720" height="201" alt="Screenshot 2026-06-05 at 8 40 04 PM" src="https://github.com/user-attachments/assets/9b5f7adf-b1e9-4e55-897c-ef766e555ca8" />
)
(<img width="787" height="117" alt="Screenshot 2026-06-05 at 8 46 53 PM" src="https://github.com/user-attachments/assets/f41ba274-688e-4404-82c2-9a999a373325" />
)

---

## Features

- 🔌 **Works on Claude, ChatGPT, Gemini** — injected via Shadow DOM, doesn't break existing UI
- 🤖 **Multi-provider AI backend** — use Anthropic, OpenAI, Gemini, NVIDIA, OpenRouter, or any custom OpenAI-compatible endpoint
- 🔒 **Encrypted API key storage** — AES-GCM 256-bit, keys never leave your device unencrypted
- 📦 **Local prompt vault** — save, label, and reuse your best prompts across sessions
- 🔍 **Dynamic input detection** — `MutationObserver` based, survives SPA navigation
- 🧩 **Manifest V3** — modern service worker architecture, no persistent background page

---

## Installation (Developer Mode)

> Prompt Forge is not on the Chrome Web Store yet. Load it as an unpacked extension.

1. Clone or download this repo
2. Open `chrome://extensions` (or `arc://extensions` on Arc)
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the root folder of this repo
6. Click the Prompt Forge icon in the toolbar → paste your API key → choose a provider

That's it. Open Claude, ChatGPT, or Gemini and the toolbar will appear above the input box.

---

## Supported AI Providers

| Provider | Endpoint |
|----------|----------|
| Anthropic | `https://api.anthropic.com/v1/messages` |
| OpenAI | `https://api.openai.com/v1/chat/completions` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/models/...` |
| NVIDIA | `https://integrate.api.nvidia.com/v1/chat/completions` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` |
| Custom | Any HTTPS OpenAI-compatible `/chat/completions` endpoint |

---

## Project Structure

```
prompt-forge/
├── manifest.json          # MV3 manifest
├── background.js          # Service worker: AI API calls, crypto, vault handlers
├── content_script.js      # MutationObserver, toolbar injection, messaging
├── sidebar.js             # <pp-sidebar> Web Component for the vault panel
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic: API key, provider, mode selection
├── storage.js             # Schema-guarded CRUD helpers for chrome.storage.local
└── tests/
    └── e2e.spec.js        # 63-case Playwright E2E suite
```

---

## Running Tests

```sh
npm init -y
npm i -D @playwright/test
npx playwright install chromium
npx playwright test tests/e2e.spec.js
```

The suite launches Chrome with a fresh user-data directory, loads the unpacked extension, and runs against controlled fixture HTML served at the chatbot domains. Use `test-` prefixed API keys to get deterministic mock responses without hitting real APIs.

---

## Security

- API keys are encrypted with **AES-GCM 256-bit** before being written to `chrome.storage.local`
- The encryption key is derived via **PBKDF2** from an install-time random secret + random salt (both from `crypto.getRandomValues`)
- A fresh **96-bit IV** is generated on every encryption
- **No AI API calls are made from content scripts** — all provider fetch calls go through the background service worker

---

## Storage Keys

| Key | Description |
|-----|-------------|
| `pp_schema_version` | Schema version (currently `1`) |
| `pp_prompts_v1` | Array of `{ id, text, label, createdAt, tags }` |
| `pp_mode_v1` | `feedback` or `rewrite` |
| `pp_ai_provider_v1` | Active provider name |
| `pp_ai_model_v1` | Model name sent to the provider |
| `pp_ai_endpoint_v1` | Custom endpoint URL (if applicable) |
| `pp_api_key_record_v1` | AES-GCM encrypted key record |

---

## Adding Support for a New Chatbot

1. Add a CSS selector to `SELECTOR_MAP` in `content_script.js`
2. Add the hostname to `host_permissions` and `content_scripts.matches` in `manifest.json`
3. Add test cases to `tests/e2e.spec.js`

---

## Built With

- Vanilla JS + Web Components (no frameworks)
- Chrome Extension Manifest V3
- Web Crypto API (AES-GCM, PBKDF2)
- Playwright (testing)

Built with assistance from [OpenAI Codex (GPT)](https://openai.com).

---

## Contributing

Pull requests are welcome! Please open an issue first to discuss what you'd like to change.

---

## License

[MIT](LICENSE)

---

## Author

**Heet** — B.E. Robotics & Automation, GTU  
Building tools that make AI workflows actually fast.
