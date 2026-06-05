# Contributing to Prompt Forge

Thanks for taking the time to contribute! Here's how to get started.

## Getting Started

1. Fork the repo and clone it locally
2. Load it as an unpacked extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked)
3. Make your changes and reload the extension

No build step required — it's plain JS.

## Running Tests

```sh
npm init -y
npm i -D @playwright/test
npx playwright install chromium
npx playwright test tests/e2e.spec.js
```

Use `test-` prefixed keys in the popup for deterministic mock responses.

## Adding a New Chatbot

1. Add the hostname to `host_permissions` and `content_scripts.matches` in `manifest.json`
2. Add a CSS selector entry to `SELECTOR_MAP` in `content_script.js`
3. Add at least 3 test cases to `tests/e2e.spec.js` covering toolbar injection, button click, and vault save
4. Update the **Supported Chatbots** section in `README.md`

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Write a clear description of *what* changed and *why*
- If you're adding a new AI provider, include the endpoint and at least one working model name in the PR description
- All existing tests should still pass

## Reporting Bugs

Open an issue with:
- Browser and version (e.g. Chrome 124, Arc 1.x)
- Which chatbot site the bug occurs on
- Steps to reproduce
- What you expected vs. what happened
- Console errors if any (DevTools → Console)

## Code Style

- Vanilla JS, no frameworks, no bundler
- Keep content scripts free of any `fetch()` calls — all API traffic goes through `background.js`
- Use `chrome.runtime.sendMessage` with the message types defined in `background.js`
- Shadow DOM for all injected UI — don't touch the chatbot's own DOM nodes
