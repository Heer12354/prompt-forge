export const PROMPTS_KEY = "pp_prompts_v1";
export const SCHEMA_VERSION_KEY = "pp_schema_version";
export const SCHEMA_VERSION = 1;
export const MODE_KEY = "pp_mode_v1";
export const AI_PROVIDER_KEY = "pp_ai_provider_v1";
export const AI_MODEL_KEY = "pp_ai_model_v1";
export const AI_ENDPOINT_KEY = "pp_ai_endpoint_v1";
export const API_KEY_RECORD_KEY = "pp_api_key_record_v1";
export const CRYPTO_SALT_KEY = "pp_crypto_salt_v1";
export const INSTALL_SECRET_KEY = "pp_install_secret_v1";
export const SELECTOR_OVERRIDES_KEY = "pp_selector_overrides_v1";
export const MAX_PROMPTS = 500;

const DEFAULT_MODE = "feedback";
const DEFAULT_PROVIDER = "nvidia";
const DEFAULT_MODELS = {
  nvidia: "nvidia/llama-3.3-nemotron-super-49b-v1",
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.0-flash",
  openrouter: "openai/gpt-4.1-mini",
  custom: ""
};

export class PromptPerfectStorageError extends Error {
  constructor(message) {
    super(message);
    this.name = "PromptPerfectStorageError";
  }
}

function getLastError() {
  return chrome.runtime?.lastError?.message;
}

function getLocalStorageArea() {
  const localStorageArea = chrome.storage?.local;
  if (!localStorageArea?.get || !localStorageArea?.set || !localStorageArea?.remove) {
    throw new PromptPerfectStorageError(
      "chrome.storage.local is unavailable. Reload the extension from arc://extensions and make sure the Storage permission is enabled."
    );
  }
  return localStorageArea;
}

export function storageGet(keys) {
  return new Promise((resolve, reject) => {
    let localStorageArea;
    try {
      localStorageArea = getLocalStorageArea();
    } catch (error) {
      reject(error);
      return;
    }

    localStorageArea.get(keys, (items) => {
      const message = getLastError();
      if (message) {
        reject(new PromptPerfectStorageError(message));
        return;
      }
      resolve(items || {});
    });
  });
}

function storageSet(items) {
  return new Promise((resolve, reject) => {
    let localStorageArea;
    try {
      localStorageArea = getLocalStorageArea();
    } catch (error) {
      reject(error);
      return;
    }

    localStorageArea.set(items, () => {
      const message = getLastError();
      if (message) {
        reject(new PromptPerfectStorageError(message));
        return;
      }
      resolve();
    });
  });
}

function storageRemove(keys) {
  return new Promise((resolve, reject) => {
    let localStorageArea;
    try {
      localStorageArea = getLocalStorageArea();
    } catch (error) {
      reject(error);
      return;
    }

    localStorageArea.remove(keys, () => {
      const message = getLastError();
      if (message) {
        reject(new PromptPerfectStorageError(message));
        return;
      }
      resolve();
    });
  });
}

export async function migrateSchema() {
  const existing = await storageGet([
    SCHEMA_VERSION_KEY,
    PROMPTS_KEY,
    MODE_KEY,
    AI_PROVIDER_KEY,
    AI_MODEL_KEY,
    AI_ENDPOINT_KEY,
    API_KEY_RECORD_KEY,
    SELECTOR_OVERRIDES_KEY
  ]);

  const patch = {};

  if (existing[SCHEMA_VERSION_KEY] !== SCHEMA_VERSION) {
    patch[SCHEMA_VERSION_KEY] = SCHEMA_VERSION;
  }

  if (!Array.isArray(existing[PROMPTS_KEY])) {
    patch[PROMPTS_KEY] = [];
  }

  if (!["rewrite", "feedback"].includes(existing[MODE_KEY])) {
    patch[MODE_KEY] = DEFAULT_MODE;
  }

  const hasSavedApiKey = Boolean(existing[API_KEY_RECORD_KEY]?.ciphertext);
  const existingProviderSupported = isSupportedProvider(existing[AI_PROVIDER_KEY]);
  const shouldUseNvidiaDefault =
    !existingProviderSupported ||
    (!hasSavedApiKey && existing[AI_PROVIDER_KEY] === "anthropic");

  if (shouldUseNvidiaDefault) {
    patch[AI_PROVIDER_KEY] = DEFAULT_PROVIDER;
  }

  const provider = shouldUseNvidiaDefault ? DEFAULT_PROVIDER : existing[AI_PROVIDER_KEY];
  if (typeof existing[AI_MODEL_KEY] !== "string" || shouldUseNvidiaDefault) {
    patch[AI_MODEL_KEY] = DEFAULT_MODELS[provider];
  }

  if (typeof existing[AI_ENDPOINT_KEY] !== "string") {
    patch[AI_ENDPOINT_KEY] = "";
  }

  if (!existing[SELECTOR_OVERRIDES_KEY] || typeof existing[SELECTOR_OVERRIDES_KEY] !== "object") {
    patch[SELECTOR_OVERRIDES_KEY] = {};
  }

  if (Object.keys(patch).length > 0) {
    await storageSet(patch);
  }
}

export async function assertSchemaVersion() {
  const items = await storageGet(SCHEMA_VERSION_KEY);
  if (items[SCHEMA_VERSION_KEY] !== SCHEMA_VERSION) {
    throw new PromptPerfectStorageError(
      `Unsupported Prompt Perfect schema version: ${items[SCHEMA_VERSION_KEY]}`
    );
  }
}

export async function setValueWithSchemaGuard(key, value) {
  await setValuesWithSchemaGuard({ [key]: value });
}

export async function setValuesWithSchemaGuard(items) {
  await assertSchemaVersion();
  await storageSet(items);
}

export async function removeValueWithSchemaGuard(key) {
  await assertSchemaVersion();
  await storageRemove(key);
}

function normalizePromptRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const text = typeof record.text === "string" ? record.text : "";
  if (!text.trim()) {
    return null;
  }

  return {
    id: typeof record.id === "string" ? record.id : createUuid(),
    text,
    label: typeof record.label === "string" && record.label.trim()
      ? record.label.trim()
      : text.trim().slice(0, 48),
    createdAt: isValidIsoDate(record.createdAt) ? record.createdAt : new Date().toISOString(),
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
      : []
  };
}

function isValidIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function createUuid() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export async function listPrompts(query = "") {
  const items = await storageGet(PROMPTS_KEY);
  const prompts = Array.isArray(items[PROMPTS_KEY])
    ? items[PROMPTS_KEY].map(normalizePromptRecord).filter(Boolean)
    : [];
  const normalizedQuery = String(query || "").trim().toLowerCase();

  return prompts
    .filter((prompt) => {
      if (!normalizedQuery) {
        return true;
      }

      return (
        prompt.label.toLowerCase().includes(normalizedQuery) ||
        prompt.text.toLowerCase().includes(normalizedQuery) ||
        prompt.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
      );
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function savePrompt({ text, label = "", tags = [] }) {
  await assertSchemaVersion();

  const normalized = normalizePromptRecord({
    id: createUuid(),
    text,
    label,
    createdAt: new Date().toISOString(),
    tags
  });

  if (!normalized) {
    throw new PromptPerfectStorageError("Prompt text is required.");
  }

  const existing = await listPrompts();
  const nextPrompts = [normalized, ...existing]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_PROMPTS);

  await storageSet({ [PROMPTS_KEY]: nextPrompts });
  return normalized;
}

export async function deletePrompt(id) {
  await assertSchemaVersion();

  if (typeof id !== "string" || !id.trim()) {
    throw new PromptPerfectStorageError("Prompt id is required.");
  }

  const existing = await listPrompts();
  const nextPrompts = existing.filter((prompt) => prompt.id !== id);
  await storageSet({ [PROMPTS_KEY]: nextPrompts });
  return { deleted: existing.length !== nextPrompts.length };
}

export async function getPromptStats() {
  const prompts = await listPrompts();
  return {
    count: prompts.length,
    max: MAX_PROMPTS
  };
}

export async function getMode() {
  const items = await storageGet(MODE_KEY);
  return ["rewrite", "feedback"].includes(items[MODE_KEY]) ? items[MODE_KEY] : DEFAULT_MODE;
}

export async function setMode(mode) {
  if (!["rewrite", "feedback"].includes(mode)) {
    throw new PromptPerfectStorageError("Mode must be rewrite or feedback.");
  }

  await setValueWithSchemaGuard(MODE_KEY, mode);
  return mode;
}

export function isSupportedProvider(provider) {
  return ["nvidia", "anthropic", "openai", "gemini", "openrouter", "custom"].includes(provider);
}

export function defaultModelForProvider(provider) {
  return DEFAULT_MODELS[provider] || "";
}

export async function getAiProviderSettings() {
  const items = await storageGet([AI_PROVIDER_KEY, AI_MODEL_KEY, AI_ENDPOINT_KEY]);
  const provider = isSupportedProvider(items[AI_PROVIDER_KEY]) ? items[AI_PROVIDER_KEY] : DEFAULT_PROVIDER;
  const model = typeof items[AI_MODEL_KEY] === "string" && items[AI_MODEL_KEY].trim()
    ? items[AI_MODEL_KEY].trim()
    : defaultModelForProvider(provider);
  const endpoint = typeof items[AI_ENDPOINT_KEY] === "string" ? items[AI_ENDPOINT_KEY].trim() : "";

  return {
    provider,
    model,
    endpoint
  };
}

export async function setAiProviderSettings({ provider, model = "", endpoint = "" }) {
  if (!isSupportedProvider(provider)) {
    throw new PromptPerfectStorageError("Provider must be NVIDIA, Anthropic, OpenAI, Gemini, OpenRouter, or custom.");
  }

  const normalizedEndpoint = String(endpoint || "").trim();
  if (provider === "custom" && !/^https:\/\/.+/i.test(normalizedEndpoint)) {
    throw new PromptPerfectStorageError("Custom providers require an HTTPS endpoint.");
  }

  const normalizedModel = String(model || "").trim() || defaultModelForProvider(provider);
  await setValuesWithSchemaGuard({
    [AI_PROVIDER_KEY]: provider,
    [AI_MODEL_KEY]: normalizedModel,
    [AI_ENDPOINT_KEY]: provider === "custom" ? normalizedEndpoint : ""
  });

  return {
    provider,
    model: normalizedModel,
    endpoint: provider === "custom" ? normalizedEndpoint : ""
  };
}

export async function getSelectorOverrides() {
  const items = await storageGet(SELECTOR_OVERRIDES_KEY);
  return items[SELECTOR_OVERRIDES_KEY] && typeof items[SELECTOR_OVERRIDES_KEY] === "object"
    ? items[SELECTOR_OVERRIDES_KEY]
    : {};
}

export async function setSelectorOverride(hostname, selector) {
  await assertSchemaVersion();

  if (typeof hostname !== "string" || typeof selector !== "string") {
    throw new PromptPerfectStorageError("Hostname and selector are required.");
  }

  const overrides = await getSelectorOverrides();
  const nextOverrides = {
    ...overrides,
    [hostname]: selector
  };
  await storageSet({ [SELECTOR_OVERRIDES_KEY]: nextOverrides });
  return nextOverrides;
}
