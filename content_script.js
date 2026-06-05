(() => {
  const PP_TAG = "[Prompt Forge]";
  const SIDEBAR_HOST_ID = "pp-sidebar-host";
  const INLINE_TOOLBAR_HOST_ID = "pp-inline-toolbar-host";
  const BASE_RETRY_MS = 150;
  const MAX_SELECTOR_RETRIES = 5;
  const INPUT_IDLE_DEBOUNCE_MS = 300;
  const SELECTOR_MAP = {
    "claude.ai": "div[contenteditable='true']",
    "chatgpt.com": "#prompt-textarea",
    "gemini.google.com": ".ql-editor"
  };

  let activeInput = null;
  let inputDebounceTimer = null;
  let detectionRunId = 0;
  let observer = null;
  let sidebarHost = null;
  let sidebarElement = null;
  let sidebarReadyPromise = null;
  let inlineToolbarHost = null;
  let inlineToolbarRoot = null;
  let toolbarPositionFrame = null;
  let toolbarListenersBound = false;
  let lastPromptText = "";
  let activeMode = "feedback";

  start();

  function start() {
    if (!document.body) {
      queueMicrotask(start);
      return;
    }

    ensureSidebarHost();
    ensureInlineToolbarHost();
    observeDom();
    scheduleDetection("initial");
    requestSettings();
  }

  function observeDom() {
    if (observer) {
      return;
    }

    observer = new MutationObserver((records) => {
      // MutationObserver batches records; iterate the records array and only
      // schedule selector work when a child list actually changed.
      for (const record of records) {
        if (record.type === "childList" && (record.addedNodes.length > 0 || record.removedNodes.length > 0)) {
          scheduleDetection("mutation");
          break;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function scheduleDetection(reason) {
    const runId = ++detectionRunId;
    detectWithBackoff({ attempt: 0, reason, runId });
  }

  function detectWithBackoff({ attempt, reason, runId }) {
    if (runId !== detectionRunId) {
      return;
    }

    const selector = selectorForCurrentHost();
    const input = selector ? findInteractiveInput(selector) : null;

    if (input) {
      bindInput(input);
      return;
    }

    if (attempt >= MAX_SELECTOR_RETRIES) {
      console.warn(`${PP_TAG} prompt input not found after ${MAX_SELECTOR_RETRIES} retries (${reason}).`);
      return;
    }

    const retryCounter = attempt + 1;
    const retryInterval = BASE_RETRY_MS * Math.pow(2, attempt);
    window.setTimeout(() => {
      detectWithBackoff({
        attempt: retryCounter,
        reason,
        runId
      });
    }, retryInterval);
  }

  function selectorForCurrentHost() {
    const hostname = window.location.hostname.replace(/^www\./, "");
    return SELECTOR_MAP[hostname] || null;
  }

  function findInteractiveInput(selector) {
    const candidates = [...document.querySelectorAll(selector)];
    return candidates.find((candidate) => isUsablePromptInput(candidate)) || null;
  }

  function isUsablePromptInput(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0;
    const disabled = element.matches("textarea:disabled,input:disabled,[aria-disabled='true']");
    const editable = element.matches("textarea,input,[contenteditable='true'],.ql-editor");
    return visible && editable && !disabled;
  }

  function bindInput(input) {
    if (activeInput === input) {
      return;
    }

    if (activeInput) {
      activeInput.removeEventListener("input", handleInputEvent, true);
      activeInput.removeEventListener("focus", handleInputFocus, true);
    }

    activeInput = input;
    activeInput.addEventListener("input", handleInputEvent, true);
    activeInput.addEventListener("focus", handleInputFocus, true);
    showInlineToolbar();

    const currentText = getInputText(activeInput);
    if (currentText) {
      activateCopilot(currentText);
    }
  }

  function handleInputFocus() {
    if (!activeInput) {
      return;
    }

    lastPromptText = getInputText(activeInput);
    showInlineToolbar();
  }

  function handleInputEvent() {
    window.clearTimeout(inputDebounceTimer);
    inputDebounceTimer = window.setTimeout(() => {
      if (!activeInput) {
        return;
      }

      const promptText = getInputText(activeInput);
      lastPromptText = promptText;
      showInlineToolbar();
      if (promptText.trim()) {
        activateCopilot(promptText);
      }
    }, INPUT_IDLE_DEBOUNCE_MS);
  }

  function getInputText(input) {
    if (!input) {
      return "";
    }

    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      return input.value;
    }

    return input.textContent || "";
  }

  function setInputText(input, text) {
    if (!input) {
      return;
    }

    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      input.value = text;
    } else {
      input.textContent = text;
    }

    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: text
      })
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function ensureInlineToolbarHost() {
    if (inlineToolbarHost?.shadowRoot) {
      return inlineToolbarHost;
    }

    inlineToolbarHost = document.getElementById(INLINE_TOOLBAR_HOST_ID);
    if (!inlineToolbarHost) {
      inlineToolbarHost = document.createElement("div");
      inlineToolbarHost.id = INLINE_TOOLBAR_HOST_ID;
      document.body.appendChild(inlineToolbarHost);
    }

    if (!inlineToolbarHost.shadowRoot) {
      inlineToolbarRoot = inlineToolbarHost.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `
        :host {
          all: initial;
        }

        .toolbar {
          align-items: center;
          box-sizing: border-box;
          display: none;
          flex-wrap: wrap;
          gap: 6px;
          max-width: calc(100vw - 24px);
          min-height: 34px;
          position: fixed;
          z-index: 2147483646;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          pointer-events: auto;
          transform-origin: bottom left;
        }

        .toolbar[data-visible="true"] {
          display: flex;
          animation: toolbar-enter 170ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        button {
          appearance: none;
          border: 1px solid rgba(20, 31, 36, 0.16);
          border-radius: 6px;
          box-shadow: 0 8px 22px rgba(20, 31, 36, 0.16);
          color: #ffffff;
          cursor: pointer;
          font: 700 12px/1 Inter, ui-sans-serif, system-ui, sans-serif;
          height: 32px;
          letter-spacing: 0;
          padding: 0 10px;
          position: relative;
          overflow: hidden;
          transform: translateY(0);
          transition:
            background 160ms ease,
            box-shadow 160ms ease,
            opacity 160ms ease,
            transform 160ms ease;
          white-space: nowrap;
        }

        button:hover {
          box-shadow: 0 10px 24px rgba(20, 31, 36, 0.22);
          transform: translateY(-1px);
        }

        button:active {
          transform: translateY(0);
        }

        button:focus-visible {
          outline: 2px solid #111827;
          outline-offset: 2px;
        }

        button[data-action="rewrite"] {
          background: linear-gradient(135deg, #1f7a5d, #248464);
        }

        button[data-action="master"] {
          background: linear-gradient(135deg, #224f9c, #1f7a5d);
        }

        button[data-action="feedback"] {
          background: linear-gradient(135deg, #6554c0, #4d6fb2);
        }

        button[data-action="save"] {
          background: linear-gradient(135deg, #a96522, #c4862a);
        }

        button[data-action="library"] {
          background: linear-gradient(135deg, #263238, #39464d);
        }

        button[disabled] {
          cursor: wait;
          opacity: 0.72;
          transform: none;
        }

        button[data-action="master"]::after,
        button[data-action="rewrite"]::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, transparent 0%, rgba(255, 255, 255, 0.28) 45%, transparent 70%);
          opacity: 0;
          transform: translateX(-120%);
        }

        button[data-action="master"]:hover::after,
        button[data-action="rewrite"]:hover::after {
          animation: button-sheen 760ms ease;
        }

        .status {
          border-radius: 6px;
          box-shadow: 0 8px 22px rgba(20, 31, 36, 0.16);
          display: none;
          min-height: 32px;
          align-items: center;
          background: #20242b;
          color: #ffffff;
          font: 650 12px/1 Inter, ui-sans-serif, system-ui, sans-serif;
          padding: 0 12px;
          position: relative;
          overflow: hidden;
          white-space: nowrap;
        }

        .status[data-visible="true"] {
          display: inline-flex;
          animation: status-enter 140ms ease;
        }

        .status[data-busy="true"]::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22), transparent);
          transform: translateX(-100%);
          animation: status-scan 1100ms ease-in-out infinite;
        }

        @keyframes toolbar-enter {
          from {
            opacity: 0;
            transform: translate3d(0, 5px, 0) scale(0.98);
          }

          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @keyframes status-enter {
          from {
            opacity: 0;
            transform: translateX(-4px);
          }

          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes status-scan {
          from {
            transform: translateX(-100%);
          }

          to {
            transform: translateX(100%);
          }
        }

        @keyframes button-sheen {
          0% {
            opacity: 0;
            transform: translateX(-120%);
          }

          35% {
            opacity: 1;
          }

          100% {
            opacity: 0;
            transform: translateX(120%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .toolbar[data-visible="true"],
          .status[data-visible="true"],
          .status[data-busy="true"]::after,
          button[data-action="master"]:hover::after,
          button[data-action="rewrite"]:hover::after {
            animation: none;
          }

          button {
            transition: none;
          }

          button:hover {
            transform: none;
          }
        }

        @media (max-width: 520px) {
          .toolbar {
            gap: 4px;
          }

          button {
            height: 30px;
            padding: 0 8px;
            font-size: 11px;
          }
        }
      `;
      const toolbar = document.createElement("div");
      toolbar.className = "toolbar";
      toolbar.dataset.testid = "pp-inline-toolbar";
      toolbar.innerHTML = `
        <button type="button" data-action="master" data-testid="pp-inline-refine-plus" title="Build a deeper master prompt">Refine++</button>
        <button type="button" data-action="rewrite" data-testid="pp-inline-refine" title="Refine this prompt">Refine</button>
        <button type="button" data-action="feedback" data-testid="pp-inline-coach" title="Get coaching notes">Coach</button>
        <button type="button" data-action="save" data-testid="pp-inline-keep" title="Keep this prompt">Keep</button>
        <button type="button" data-action="library" data-testid="pp-inline-vault" title="Open prompt vault">Vault</button>
        <span class="status" data-testid="pp-inline-status"></span>
      `;
      toolbar.addEventListener("click", handleInlineToolbarClick);
      inlineToolbarRoot.append(style, toolbar);
    } else {
      inlineToolbarRoot = inlineToolbarHost.shadowRoot;
    }

    bindToolbarPositionListeners();
    return inlineToolbarHost;
  }

  function bindToolbarPositionListeners() {
    if (toolbarListenersBound) {
      return;
    }

    toolbarListenersBound = true;
    window.addEventListener("resize", scheduleInlineToolbarPosition, { passive: true });
    window.addEventListener("scroll", scheduleInlineToolbarPosition, { passive: true, capture: true });
  }

  function showInlineToolbar() {
    ensureInlineToolbarHost();
    const toolbar = inlineToolbarRoot.querySelector(".toolbar");
    toolbar.dataset.visible = activeInput ? "true" : "false";
    setInlineToolbarStatus("");
    scheduleInlineToolbarPosition();
  }

  function scheduleInlineToolbarPosition() {
    if (toolbarPositionFrame) {
      return;
    }

    toolbarPositionFrame = window.requestAnimationFrame(() => {
      toolbarPositionFrame = null;
      updateInlineToolbarPosition();
    });
  }

  function updateInlineToolbarPosition() {
    if (!activeInput || !inlineToolbarRoot) {
      return;
    }

    const toolbar = inlineToolbarRoot.querySelector(".toolbar");
    const rect = activeInput.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      toolbar.dataset.visible = "false";
      return;
    }

    const toolbarRect = toolbar.getBoundingClientRect();
    const gap = 8;
    const viewportPadding = 12;
    const preferredTop = rect.top - toolbarRect.height - gap;
    const fallbackTop = rect.bottom + gap;
    const top = preferredTop >= viewportPadding
      ? preferredTop
      : Math.min(fallbackTop, window.innerHeight - toolbarRect.height - viewportPadding);
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - toolbarRect.width - viewportPadding
    );

    toolbar.style.top = `${Math.max(top, viewportPadding)}px`;
    toolbar.style.left = `${left}px`;
    toolbar.dataset.visible = "true";
  }

  function setInlineToolbarStatus(message, { busy = false, error = false } = {}) {
    if (!inlineToolbarRoot) {
      return;
    }

    const status = inlineToolbarRoot.querySelector(".status");
    const buttons = inlineToolbarRoot.querySelectorAll("button");
    status.textContent = message || "";
    status.dataset.visible = message ? "true" : "false";
    status.dataset.busy = busy ? "true" : "false";
    status.dataset.error = error ? "true" : "false";
    status.style.background = error ? "#9c2d1f" : "#20242b";

    for (const button of buttons) {
      button.disabled = Boolean(busy);
    }

    scheduleInlineToolbarPosition();
  }

  function handleInlineToolbarClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    if (action === "master") {
      requestAi("master");
      return;
    }

    if (action === "rewrite") {
      requestAi("rewrite");
      return;
    }

    if (action === "feedback") {
      requestAi("feedback");
      return;
    }

    if (action === "save") {
      savePrompt({
        text: lastPromptText || getInputText(activeInput),
        label: (lastPromptText || getInputText(activeInput)).trim().slice(0, 48),
        tags: []
      });
      return;
    }

    if (action === "library") {
      openLibraryPanel();
    }
  }

  async function ensureSidebarHost() {
    if (sidebarHost?.shadowRoot) {
      return sidebarHost;
    }

    sidebarHost = document.getElementById(SIDEBAR_HOST_ID);
    if (!sidebarHost) {
      sidebarHost = document.createElement("div");
      sidebarHost.id = SIDEBAR_HOST_ID;
      document.body.appendChild(sidebarHost);
    }

    if (!sidebarHost.shadowRoot) {
      const shadowRoot = sidebarHost.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `
        :host, #pp-shell {
          all: initial;
        }

        #pp-shell {
          position: fixed;
          top: 72px;
          right: 16px;
          width: 320px;
          max-width: calc(100vw - 32px);
          z-index: 2147483647;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color-scheme: light;
          pointer-events: auto;
        }
      `;
      const shell = document.createElement("div");
      shell.id = "pp-shell";
      shadowRoot.append(style, shell);
    }

    await ensureSidebarElement();
    return sidebarHost;
  }

  async function ensureSidebarElement() {
    if (sidebarElement) {
      return sidebarElement;
    }

    if (!sidebarReadyPromise) {
      sidebarReadyPromise = import(chrome.runtime.getURL("sidebar.js")).then((module) => {
        const shell = sidebarHost.shadowRoot.querySelector("#pp-shell");
        sidebarElement = module.createPromptPerfectSidebar
          ? module.createPromptPerfectSidebar()
          : document.createElement("pp-sidebar");
        shell.appendChild(sidebarElement);
        bindSidebarEvents(sidebarElement);
        if (typeof sidebarElement.connectPromptPerfectSidebar === "function") {
          sidebarElement.connectPromptPerfectSidebar();
        }
        return sidebarElement;
      });
    }

    return sidebarReadyPromise;
  }

  function bindSidebarEvents(element) {
    element.addEventListener("pp:master", () => requestAi("master"));
    element.addEventListener("pp:rewrite", () => requestAi("rewrite"));
    element.addEventListener("pp:feedback", () => requestAi("feedback"));
    element.addEventListener("pp:save", (event) => savePrompt(event.detail || {}));
    element.addEventListener("pp:delete", (event) => deletePrompt(event.detail?.id));
    element.addEventListener("pp:insert", (event) => insertPromptText(event.detail?.text || ""));
    element.addEventListener("pp:refresh", () => refreshLibrary());
    element.addEventListener("pp:close", () => hideSidebarPanel());
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "PP_SHOW_LIBRARY_PANEL") {
      return false;
    }

    openLibraryPanel()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message || "Could not open Prompt Forge panel."
        });
      });

    return true;
  });

  async function activateCopilot(promptText) {
    lastPromptText = promptText;
    const element = await ensureSidebarElement();
    element.setState({
      visible: true,
      promptText,
      mode: activeMode
    });
    refreshLibrary();
  }

  async function requestAi(mode) {
    const promptText = (lastPromptText || getInputText(activeInput)).trim();
    if (!promptText) {
      setInlineToolbarStatus("Type a prompt first", { error: true });
      return;
    }

    const element = await ensureSidebarElement();
    setInlineToolbarStatus(statusForMode(mode, "busy"), { busy: true });
    element.setState({
      visible: true,
      loading: true,
      error: "",
      result: null,
      mode
    });

    try {
      const response = await sendRuntimeMessage("PP_AI_PROCESS", {
        promptText,
        mode
      });
      element.setState({
        loading: false,
        result: response,
        mode
      });
      setInlineToolbarStatus(statusForMode(mode, "done"));
      window.setTimeout(() => setInlineToolbarStatus(""), 1400);
    } catch (error) {
      element.setState({
        loading: false,
        error: error.message || "Prompt Forge could not process this prompt."
      });
      setInlineToolbarStatus("Could not process", { error: true });
    }
  }

  function statusForMode(mode, state) {
    const statuses = {
      master: {
        busy: "Forging++...",
        done: "Refine++ ready"
      },
      rewrite: {
        busy: "Refining...",
        done: "Refined"
      },
      feedback: {
        busy: "Coaching...",
        done: "Notes ready"
      }
    };

    return statuses[mode]?.[state] || statuses.feedback[state];
  }

  async function savePrompt(detail) {
    const text = String(detail.text || lastPromptText || "").trim();
    if (!text) {
      setInlineToolbarStatus("Type a prompt first", { error: true });
      return;
    }

    const label = String(detail.label || "").trim() || text.slice(0, 48);
    const tags = Array.isArray(detail.tags) ? detail.tags : parseTags(detail.tags);
    const element = await ensureSidebarElement();

    try {
      await sendRuntimeMessage("PP_LIBRARY_SAVE", {
        text,
        label,
        tags
      });
      await refreshLibrary();
      element.setState({ error: "" });
      setInlineToolbarStatus("Saved");
      window.setTimeout(() => setInlineToolbarStatus(""), 1400);
    } catch (error) {
      element.setState({ error: error.message || "Could not save prompt." });
      setInlineToolbarStatus("Could not save", { error: true });
    }
  }

  async function openLibraryPanel() {
    const promptText = lastPromptText || getInputText(activeInput);
    const element = await ensureSidebarElement();
    element.setState({
      visible: true,
      promptText,
      mode: activeMode
    });
    await refreshLibrary();
  }

  function hideSidebarPanel() {
    if (!sidebarElement) {
      return;
    }

    sidebarElement.setState({
      visible: false,
      loading: false,
      error: ""
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideSidebarPanel();
    }
  }, true);

  async function deletePrompt(id) {
    if (!id) {
      return;
    }

    const element = await ensureSidebarElement();
    try {
      await sendRuntimeMessage("PP_LIBRARY_DELETE", { id });
      await refreshLibrary();
    } catch (error) {
      element.setState({ error: error.message || "Could not delete prompt." });
    }
  }

  async function refreshLibrary() {
    const element = await ensureSidebarElement();
    try {
      const prompts = await sendRuntimeMessage("PP_LIBRARY_LIST", {});
      element.setState({ prompts });
    } catch (error) {
      element.setState({ error: error.message || "Could not load prompt library." });
    }
  }

  async function requestSettings() {
    try {
      const settings = await sendRuntimeMessage("PP_GET_SETTINGS", {});
      activeMode = settings.mode || "feedback";
      const element = await ensureSidebarElement();
      element.setState({ mode: activeMode });
    } catch (error) {
      activeMode = "feedback";
    }
  }

  function insertPromptText(text) {
    if (!activeInput || !text) {
      return;
    }

    setInputText(activeInput, text);
    activeInput.focus();
  }

  function parseTags(value) {
    return String(value || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function sendRuntimeMessage(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        if (!response?.ok) {
          const error = new Error(response?.error?.message || "Prompt Forge request failed.");
          error.name = response?.error?.name || "Error";
          reject(error);
          return;
        }

        resolve(response.payload);
      });
    });
  }
})();
