const form = document.getElementById("settings-form");
const providerInput = document.getElementById("provider");
const modelInput = document.getElementById("model");
const endpointRow = document.getElementById("endpoint-row");
const endpointInput = document.getElementById("endpoint");
const modeInput = document.getElementById("mode");
const apiKeyInput = document.getElementById("api-key");
const savedCount = document.getElementById("saved-count");
const apiKeyState = document.getElementById("api-key-state");
const status = document.getElementById("status");
const openSidePanelButton = document.getElementById("open-side-panel");

init();

const DEFAULT_MODELS = {
  nvidia: "nvidia/llama-3.3-nemotron-super-49b-v1",
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.0-flash",
  openrouter: "openai/gpt-4.1-mini",
  custom: ""
};

async function init() {
  await refreshSettings();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSettings();
  });

  providerInput.addEventListener("change", () => {
    syncProviderUi({ resetModel: true });
  });

  openSidePanelButton.addEventListener("click", async () => {
    try {
      const openedInPage = await openPromptPanelInActiveTab();
      if (openedInPage) {
        setStatus("Prompt panel opened on the active tab.");
        return;
      }

      if (chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
        setStatus("Browser side panel opened.");
        return;
      }

      setStatus("Open ChatGPT, Claude, or Gemini, then try again.", true);
    } catch (error) {
      setStatus(error.message || "Could not open Prompt Forge panel.", true);
    }
  });
}

async function refreshSettings() {
  try {
    const settings = await sendRuntimeMessage("PP_GET_SETTINGS", {});
    providerInput.value = settings.provider || "nvidia";
    modelInput.value = settings.model || DEFAULT_MODELS[providerInput.value] || "";
    endpointInput.value = settings.endpoint || "";
    syncProviderUi({ resetModel: false });
    modeInput.value = settings.mode || "feedback";
    savedCount.textContent = String(settings.stats?.count || 0);
    apiKeyState.textContent = settings.hasApiKey ? "Yes" : "No";
  } catch (error) {
    setStatus(error.message || "Could not load settings.", true);
  }
}

function syncProviderUi({ resetModel = false } = {}) {
  const provider = providerInput.value;
  const isCustom = provider === "custom";

  endpointRow.hidden = !isCustom;
  endpointInput.disabled = !isCustom;
  if (!isCustom) {
    endpointInput.value = "";
  }

  if (resetModel || !modelInput.value.trim()) {
    modelInput.value = DEFAULT_MODELS[provider] || "";
  }
}

async function saveSettings() {
  try {
    await sendRuntimeMessage("PP_SET_MODE", {
      mode: modeInput.value
    });

    await ensureCustomEndpointPermission();
    await sendRuntimeMessage("PP_SET_AI_PROVIDER", {
      provider: providerInput.value,
      model: modelInput.value.trim(),
      endpoint: endpointInput.value.trim()
    });

    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      await sendRuntimeMessage("PP_SAVE_API_KEY", {
        apiKey
      });
      apiKeyInput.value = "";
    }

    await refreshSettings();
    setStatus("Settings saved.");
  } catch (error) {
    setStatus(error.message || "Could not save settings.", true);
  }
}

async function ensureCustomEndpointPermission() {
  if (providerInput.value !== "custom") {
    return;
  }

  const endpoint = endpointInput.value.trim();
  if (!endpoint) {
    throw new Error("Custom providers require an HTTPS endpoint.");
  }

  const origin = new URL(endpoint).origin;
  const permissions = {
    origins: [`${origin}/*`]
  };

  const hasPermission = await containsPermission(permissions);
  if (!hasPermission) {
    const granted = await requestPermission(permissions);
    if (!granted) {
      throw new Error("Chrome permission is required for that custom API endpoint.");
    }
  }
}

function containsPermission(permissions) {
  return new Promise((resolve, reject) => {
    chrome.permissions.contains(permissions, (result) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(Boolean(result));
    });
  });
}

function requestPermission(permissions) {
  return new Promise((resolve, reject) => {
    chrome.permissions.request(permissions, (granted) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(Boolean(granted));
    });
  });
}

async function openPromptPanelInActiveTab() {
  if (!chrome.tabs?.query || !chrome.tabs?.sendMessage) {
    return false;
  }

  const [tab] = await queryTabs({
    active: true,
    currentWindow: true
  });

  if (!tab?.id || !isSupportedChatbotUrl(tab.url || "")) {
    return false;
  }

  const response = await sendTabMessage(tab.id, {
    type: "PP_SHOW_LIBRARY_PANEL"
  });
  return Boolean(response?.ok);
}

function isSupportedChatbotUrl(url) {
  return /^https:\/\/(claude\.ai|chatgpt\.com|gemini\.google\.com)\//.test(url);
}

function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(tabs || []);
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
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
