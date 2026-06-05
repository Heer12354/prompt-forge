const TEMPLATE = document.createElement("template");

TEMPLATE.innerHTML = `
  <style>
    :host {
      all: initial;
      display: block;
      width: 320px;
      max-width: calc(100vw - 32px);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #15201d;
    }

    .panel {
      display: none;
      overflow: hidden;
      border: 1px solid rgba(21, 32, 29, 0.16);
      border-radius: 8px;
      background: #fbfcfa;
      box-shadow: 0 20px 60px rgba(21, 32, 29, 0.22);
      transform-origin: top right;
    }

    :host([visible]) .panel {
      display: block;
      animation: panel-enter 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 12px 10px;
      border-bottom: 1px solid rgba(21, 32, 29, 0.12);
      background:
        linear-gradient(135deg, rgba(31, 122, 93, 0.08), rgba(80, 85, 174, 0.07)),
        #f4f7f2;
    }

    h2 {
      margin: 0;
      font: 700 14px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
      letter-spacing: 0;
    }

    .header-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .score {
      min-width: 42px;
      border-radius: 999px;
      padding: 4px 8px;
      background: #d9ece5;
      color: #0f3b2f;
      text-align: center;
      font: 700 12px/1 Inter, ui-sans-serif, system-ui, sans-serif;
      transition: background 180ms ease, color 180ms ease, transform 180ms ease;
    }

    .score:not(:empty) {
      animation: score-pop 260ms ease;
    }

    .body {
      display: grid;
      gap: 10px;
      max-height: min(720px, calc(100vh - 112px));
      overflow: auto;
      padding: 12px;
    }

    .prompt {
      max-height: 80px;
      overflow: auto;
      border: 1px solid rgba(21, 32, 29, 0.14);
      border-radius: 6px;
      padding: 8px;
      background: #ffffff;
      color: #24302d;
      font: 400 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .actions, .save-row {
      display: grid;
      gap: 8px;
    }

    .actions {
      grid-template-columns: 1fr 1fr 1fr;
    }

    .save-row {
      grid-template-columns: 1fr 1fr;
    }

    button {
      min-height: 34px;
      border: 1px solid rgba(21, 32, 29, 0.14);
      border-radius: 6px;
      background: #ffffff;
      color: #15201d;
      cursor: pointer;
      font: 650 12px/1 Inter, ui-sans-serif, system-ui, sans-serif;
      position: relative;
      overflow: hidden;
      transition:
        background 160ms ease,
        border-color 160ms ease,
        box-shadow 160ms ease,
        color 160ms ease,
        transform 160ms ease;
    }

    button:hover {
      background: #eef4ef;
      box-shadow: 0 8px 18px rgba(21, 32, 29, 0.08);
      transform: translateY(-1px);
    }

    button:active {
      transform: translateY(0);
    }

    button.primary {
      border-color: #1f7a5d;
      background: linear-gradient(135deg, #1f7a5d, #258866);
      color: #ffffff;
      box-shadow: 0 10px 24px rgba(31, 122, 93, 0.22);
    }

    button.primary::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(110deg, transparent 0%, rgba(255, 255, 255, 0.28) 45%, transparent 70%);
      opacity: 0;
      transform: translateX(-120%);
    }

    button.primary:hover::after {
      animation: button-sheen 760ms ease;
    }

    button.close {
      display: inline-grid;
      width: 30px;
      min-height: 30px;
      place-items: center;
      border-color: transparent;
      border-radius: 999px;
      background: transparent;
      color: #52615c;
      font: 750 18px/1 Inter, ui-sans-serif, system-ui, sans-serif;
    }

    button.close:hover {
      background: rgba(21, 32, 29, 0.08);
      color: #15201d;
    }

    button.danger {
      color: #9c2d1f;
    }

    input {
      box-sizing: border-box;
      width: 100%;
      min-height: 34px;
      border: 1px solid rgba(21, 32, 29, 0.16);
      border-radius: 6px;
      padding: 0 9px;
      background: #ffffff;
      color: #15201d;
      font: 400 12px/1 Inter, ui-sans-serif, system-ui, sans-serif;
      transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
    }

    input:focus {
      border-color: rgba(31, 122, 93, 0.52);
      box-shadow: 0 0 0 3px rgba(31, 122, 93, 0.12);
      outline: none;
    }

    .result, .library {
      display: grid;
      gap: 8px;
      border-top: 1px solid rgba(21, 32, 29, 0.12);
      padding-top: 10px;
    }

    .result h3, .library h3 {
      margin: 0;
      color: #52615c;
      font: 700 11px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .rewrite {
      border-radius: 6px;
      padding: 8px;
      background:
        linear-gradient(135deg, rgba(31, 122, 93, 0.10), rgba(80, 85, 174, 0.07)),
        #edf7f3;
      color: #123329;
      font: 400 12px/1.45 Inter, ui-sans-serif, system-ui, sans-serif;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      animation: result-enter 240ms ease both;
    }

    ul {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: center;
      gap: 6px;
      border: 1px solid rgba(21, 32, 29, 0.12);
      border-radius: 6px;
      padding: 6px;
      background: #ffffff;
      transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
    }

    li:hover {
      border-color: rgba(31, 122, 93, 0.22);
      box-shadow: 0 8px 18px rgba(21, 32, 29, 0.06);
    }

    .item-text {
      min-width: 0;
    }

    .label {
      overflow: hidden;
      color: #15201d;
      font: 650 12px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meta {
      margin-top: 3px;
      overflow: hidden;
      color: #687873;
      font: 400 11px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .icon {
      width: 30px;
      min-height: 30px;
      padding: 0;
      font-size: 14px;
    }

    .empty, .error, .loading {
      border-radius: 6px;
      padding: 8px;
      background: #f4f7f2;
      color: #52615c;
      font: 400 12px/1.35 Inter, ui-sans-serif, system-ui, sans-serif;
      animation: result-enter 180ms ease both;
    }

    .error {
      background: #fff0ed;
      color: #9c2d1f;
    }

    .loading {
      display: grid;
      gap: 8px;
      border: 1px solid rgba(31, 122, 93, 0.12);
      background:
        linear-gradient(135deg, rgba(31, 122, 93, 0.09), rgba(80, 85, 174, 0.08)),
        #f7faf8;
      color: #263832;
    }

    .loading-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-weight: 650;
    }

    .thinking-dots {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .thinking-dots span {
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: #1f7a5d;
      opacity: 0.38;
      animation: dot-pulse 900ms ease-in-out infinite;
    }

    .thinking-dots span:nth-child(2) {
      animation-delay: 120ms;
    }

    .thinking-dots span:nth-child(3) {
      animation-delay: 240ms;
    }

    .loading-lines {
      display: grid;
      gap: 6px;
    }

    .loading-lines span {
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(21, 32, 29, 0.08);
      position: relative;
    }

    .loading-lines span::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, rgba(31, 122, 93, 0.24), transparent);
      transform: translateX(-100%);
      animation: line-scan 1150ms ease-in-out infinite;
    }

    .loading-lines span:nth-child(2) {
      width: 84%;
    }

    .loading-lines span:nth-child(3) {
      width: 68%;
    }

    @keyframes panel-enter {
      from {
        opacity: 0;
        transform: translate3d(10px, -8px, 0) scale(0.98);
      }

      to {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }
    }

    @keyframes result-enter {
      from {
        opacity: 0;
        transform: translateY(6px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes score-pop {
      0% {
        transform: scale(0.92);
      }

      70% {
        transform: scale(1.06);
      }

      100% {
        transform: scale(1);
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

    @keyframes dot-pulse {
      0%, 100% {
        opacity: 0.32;
        transform: translateY(0);
      }

      50% {
        opacity: 1;
        transform: translateY(-2px);
      }
    }

    @keyframes line-scan {
      from {
        transform: translateX(-100%);
      }

      to {
        transform: translateX(100%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host([visible]) .panel,
      .score:not(:empty),
      .rewrite,
      .empty,
      .error,
      .loading,
      .thinking-dots span,
      .loading-lines span::after,
      button.primary:hover::after {
        animation: none;
      }

      button,
      input,
      .score,
      li {
        transition: none;
      }

      button:hover {
        transform: none;
      }
    }
  </style>
  <aside class="panel" data-testid="pp-panel" aria-label="Prompt Forge">
    <header>
      <h2>Prompt Forge</h2>
      <div class="header-actions">
        <span class="score" data-testid="pp-score">--</span>
        <button class="close" type="button" data-action="close" data-testid="pp-close" title="Close Prompt Forge" aria-label="Close Prompt Forge">x</button>
      </div>
    </header>
    <div class="body">
      <div class="prompt" data-testid="pp-current-prompt"></div>
      <div class="actions">
        <button class="primary" type="button" data-action="master" data-testid="pp-master">Refine++</button>
        <button type="button" data-action="rewrite" data-testid="pp-rewrite">Refine</button>
        <button type="button" data-action="feedback" data-testid="pp-feedback">Coach</button>
      </div>
      <div class="save-row">
        <input data-testid="pp-label" placeholder="Name this prompt" aria-label="Prompt label">
        <button type="button" data-action="save" data-testid="pp-save">Keep</button>
      </div>
      <div class="result" data-testid="pp-result"></div>
      <div class="library">
        <h3>Vault</h3>
        <input data-testid="pp-search" placeholder="Search vault" aria-label="Search prompt vault">
        <ul data-testid="pp-list"></ul>
      </div>
    </div>
  </aside>
`;

class PromptPerfectSidebar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
    this.state = {
      visible: false,
      promptText: "",
      mode: "feedback",
      prompts: [],
      search: "",
      loading: false,
      error: "",
      result: null
    };
  }

  connectedCallback() {
    this.shadowRoot.addEventListener("click", (event) => this.handleClick(event));
    this.shadowRoot.querySelector("[data-testid='pp-search']").addEventListener("input", (event) => {
      this.setState({ search: event.target.value });
    });
    this.render();
    this.dispatch("pp:refresh");
  }

  setState(patch) {
    this.state = {
      ...this.state,
      ...patch
    };
    this.render();
  }

  handleClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;

    if (action === "master") {
      this.dispatch("pp:master");
      return;
    }

    if (action === "rewrite") {
      this.dispatch("pp:rewrite");
      return;
    }

    if (action === "close") {
      this.setState({ visible: false });
      this.dispatch("pp:close");
      return;
    }

    if (action === "feedback") {
      this.dispatch("pp:feedback");
      return;
    }

    if (action === "save") {
      const label = this.shadowRoot.querySelector("[data-testid='pp-label']").value;
      this.dispatch("pp:save", {
        text: this.state.promptText,
        label,
        tags: []
      });
      return;
    }

    if (action === "insert") {
      const prompt = this.state.prompts.find((item) => item.id === button.dataset.id);
      this.dispatch("pp:insert", {
        text: prompt?.text || button.dataset.text || ""
      });
      return;
    }

    if (action === "insert-rewrite") {
      this.dispatch("pp:insert", {
        text: this.state.result?.rewrite || ""
      });
      return;
    }

    if (action === "delete") {
      this.dispatch("pp:delete", {
        id: button.dataset.id
      });
    }
  }

  dispatch(type, detail = {}) {
    this.dispatchEvent(
      new CustomEvent(type, {
        detail,
        bubbles: true,
        composed: true
      })
    );
  }

  render() {
    this.toggleAttribute("visible", Boolean(this.state.visible));
    this.shadowRoot.querySelector("[data-testid='pp-current-prompt']").textContent =
      this.state.promptText || "Start typing in the prompt box.";
    this.shadowRoot.querySelector("[data-testid='pp-score']").textContent =
      typeof this.state.result?.score === "number" ? String(Math.round(this.state.result.score)) : "--";

    this.renderResult();
    this.renderLibrary();
  }

  renderResult() {
    const result = this.shadowRoot.querySelector("[data-testid='pp-result']");
    result.replaceChildren();

    if (this.state.loading) {
      const loading = document.createElement("div");
      loading.className = "loading";
      loading.dataset.testid = "pp-loading";
      loading.innerHTML = `
        <div class="loading-title">
          <span>${loadingTextForMode(this.state.mode)}</span>
          <span class="thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="loading-lines" aria-hidden="true"><span></span><span></span><span></span></div>
      `;
      result.appendChild(loading);
      return;
    }

    if (this.state.error) {
      const error = document.createElement("div");
      error.className = "error";
      error.dataset.testid = "pp-error";
      error.textContent = this.state.error;
      result.appendChild(error);
      return;
    }

    if (!this.state.result) {
      return;
    }

    const heading = document.createElement("h3");
    heading.textContent = this.state.mode === "master" ? "Master Prompt" : "Result";
    result.appendChild(heading);

    if (this.state.result.rewrite) {
      const rewrite = document.createElement("div");
      rewrite.className = "rewrite";
      rewrite.dataset.testid = "pp-rewrite-output";
      rewrite.textContent = this.state.result.rewrite;

      const insert = document.createElement("button");
      insert.type = "button";
      insert.className = "primary";
      insert.dataset.action = "insert-rewrite";
      insert.dataset.testid = "pp-insert-rewrite";
      insert.textContent = this.state.mode === "master" ? "Use Master Prompt" : "Use Refined Prompt";

      result.append(rewrite, insert);
    }

    const list = document.createElement("ul");
    list.dataset.testid = "pp-feedback-list";

    for (const item of this.state.result.feedback || []) {
      const li = document.createElement("li");
      const text = document.createElement("div");
      text.className = "item-text";
      text.textContent = item;
      li.appendChild(text);
      list.appendChild(li);
    }

    result.appendChild(list);
  }

  renderLibrary() {
    const list = this.shadowRoot.querySelector("[data-testid='pp-list']");
    list.replaceChildren();

    const query = this.state.search.trim().toLowerCase();
    const prompts = this.state.prompts.filter((prompt) => {
      if (!query) {
        return true;
      }
      return (
        prompt.label.toLowerCase().includes(query) ||
        prompt.text.toLowerCase().includes(query) ||
        prompt.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });

    if (prompts.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.dataset.testid = "pp-empty";
      empty.textContent = "Vault is empty.";
      list.appendChild(empty);
      return;
    }

    for (const prompt of prompts) {
      const item = document.createElement("li");
      item.dataset.promptId = prompt.id;

      const text = document.createElement("div");
      text.className = "item-text";

      const label = document.createElement("div");
      label.className = "label";
      label.textContent = prompt.label;

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = prompt.tags.length ? prompt.tags.join(", ") : new Date(prompt.createdAt).toLocaleDateString();

      const insert = document.createElement("button");
      insert.type = "button";
      insert.className = "icon";
      insert.title = "Insert";
      insert.dataset.action = "insert";
      insert.dataset.id = prompt.id;
      insert.dataset.testid = "pp-insert";
      insert.textContent = "+";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon danger";
      remove.title = "Delete";
      remove.dataset.action = "delete";
      remove.dataset.id = prompt.id;
      remove.dataset.testid = "pp-delete";
      remove.textContent = "x";

      text.append(label, meta);
      item.append(text, insert, remove);
      list.appendChild(item);
    }
  }
}

function loadingTextForMode(mode) {
  if (mode === "master") {
    return "Building a stronger master prompt";
  }

  if (mode === "rewrite") {
    return "Refining your prompt";
  }

  return "Reading for useful coaching";
}

function createPromptPerfectSidebar() {
  const element = document.createElement("div");
  element.dataset.ppSidebarRoot = "true";
  element.attachShadow({ mode: "open" });
  element.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
  element.state = {
    visible: false,
    promptText: "",
    mode: "feedback",
    prompts: [],
    search: "",
    loading: false,
    error: "",
    result: null
  };
  element.handleClick = PromptPerfectSidebar.prototype.handleClick.bind(element);
  element.dispatch = PromptPerfectSidebar.prototype.dispatch.bind(element);
  element.setState = PromptPerfectSidebar.prototype.setState.bind(element);
  element.render = PromptPerfectSidebar.prototype.render.bind(element);
  element.renderResult = PromptPerfectSidebar.prototype.renderResult.bind(element);
  element.renderLibrary = PromptPerfectSidebar.prototype.renderLibrary.bind(element);
  element.connectPromptPerfectSidebar = () => {
    if (element.dataset.ppConnected === "true") {
      return;
    }

    element.dataset.ppConnected = "true";
    element.shadowRoot.addEventListener("click", element.handleClick);
    element.shadowRoot.querySelector("[data-testid='pp-search']").addEventListener("input", (event) => {
      element.setState({ search: event.target.value });
    });
    element.render();
    element.dispatch("pp:refresh");
  };

  return element;
}

const customElementRegistry = globalThis.customElements;
if (customElementRegistry?.get && !customElementRegistry.get("pp-sidebar")) {
  customElementRegistry.define("pp-sidebar", PromptPerfectSidebar);
}

export { PromptPerfectSidebar, createPromptPerfectSidebar };
