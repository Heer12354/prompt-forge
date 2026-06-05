# Changelog

All notable changes to Prompt Forge will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.0] — 2026-06-05

### Added
- Shadow DOM toolbar injection on Claude, ChatGPT, and Gemini
- **Refine++** button: deep master prompt with role, objective, constraints, output format, acceptance checks
- **Refine** button: clean prompt rewrite
- **Coach** button: improvement notes without rewriting
- **Keep** button: saves prompt to local vault
- **Vault** button: opens saved prompt panel
- Multi-provider AI backend: Anthropic, OpenAI, Gemini, NVIDIA, OpenRouter, custom endpoint
- AES-GCM 256-bit API key encryption with PBKDF2 key derivation
- `MutationObserver`-based input detection (survives SPA navigation)
- Local prompt vault with `{ id, text, label, createdAt, tags }` schema
- Popup UI for provider/model/key/mode configuration
- `<pp-sidebar>` Web Component for vault panel
- Schema-guarded `storage.js` CRUD helpers
- 63-case Playwright E2E test suite
- Manifest V3 with service worker architecture
