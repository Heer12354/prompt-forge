import {
  API_KEY_RECORD_KEY,
  CRYPTO_SALT_KEY,
  INSTALL_SECRET_KEY,
  assertSchemaVersion,
  defaultModelForProvider,
  getAiProviderSettings,
  getMode,
  getPromptStats,
  listPrompts,
  migrateSchema,
  savePrompt,
  deletePrompt,
  setAiProviderSettings,
  setMode,
  setValueWithSchemaGuard,
  setValuesWithSchemaGuard,
  storageGet,
} from "./storage.js";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1024;
const MASTER_MAX_TOKENS = 1800;
const REQUEST_TIMEOUT_MS = 8000;
const MASTER_REQUEST_TIMEOUT_MS = 30000;
const API_KEY_TEST_PREFIX = "test-";
let runtimeReadyPromise = null;

export class PromptPerfectParseError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "PromptPerfectParseError";
    this.cause = cause;
  }
}

class PromptPerfectApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "PromptPerfectApiError";
    this.status = status;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureRuntimeReady({ refresh: true })
    .catch((error) => console.error("[Prompt Forge] install migration failed", error));
});

chrome.runtime.onStartup.addListener(() => {
  ensureRuntimeReady({ refresh: true })
    .catch((error) => console.error("[Prompt Forge] startup migration failed", error));
});

// Async onMessage handlers in MV3 must either return a Promise from supported
// contexts or call sendResponse and return true. This explicit pattern keeps
// the service worker alive while the AI/storage async work finishes.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: {
          name: error.name || "Error",
          message: error.message || "Unexpected Prompt Forge error."
        }
      });
    });

  return true;
});

async function handleMessage(message, sender) {
  if (!message || typeof message !== "object") {
    throw new Error("Message payload is required.");
  }

  await ensureRuntimeReady();

  switch (message.type) {
    case "PP_AI_PROCESS":
      return processPrompt(message.payload);
    case "PP_LIBRARY_LIST":
      return listPrompts(message.payload?.query || "");
    case "PP_LIBRARY_SAVE":
      return savePrompt(message.payload || {});
    case "PP_LIBRARY_DELETE":
      return deletePrompt(message.payload?.id);
    case "PP_LIBRARY_STATS":
      return getPromptStats();
    case "PP_GET_SETTINGS":
      return getSettings();
    case "PP_SET_MODE":
      return setMode(message.payload?.mode);
    case "PP_SET_AI_PROVIDER":
      return setAiProviderSettings(message.payload || {});
    case "PP_SAVE_API_KEY":
      return saveApiKey(message.payload?.apiKey || "");
    case "PP_CLEAR_API_KEY":
      return clearApiKey();
    case "PP_OPEN_SIDE_PANEL":
      return openSidePanel(sender);
    default:
      throw new Error(`Unsupported Prompt Forge message: ${message.type}`);
  }
}

function ensureRuntimeReady({ refresh = false } = {}) {
  if (!runtimeReadyPromise || refresh) {
    runtimeReadyPromise = migrateSchema().then(() => ensureCryptoSeed());
  }

  return runtimeReadyPromise;
}

async function getSettings() {
  const [mode, providerSettings, stats, apiKeyRecord] = await Promise.all([
    getMode(),
    getAiProviderSettings(),
    getPromptStats(),
    storageGet(API_KEY_RECORD_KEY)
  ]);

  return {
    mode,
    provider: providerSettings.provider,
    model: providerSettings.model,
    endpoint: providerSettings.endpoint,
    stats,
    hasApiKey: Boolean(apiKeyRecord[API_KEY_RECORD_KEY]?.ciphertext)
  };
}

async function processPrompt(payload = {}) {
  const promptText = String(payload.promptText || "").trim();
  const mode = normalizePromptMode(payload.mode);

  if (promptText.length < 1 || promptText.length > 4000) {
    throw new Error("Prompt text must be between 1 and 4000 characters.");
  }

  const [apiKey, providerSettings] = await Promise.all([
    getApiKey(),
    getAiProviderSettings()
  ]);
  const responseText = await callAiWithRetry({
    apiKey,
    providerSettings,
    promptText,
    mode
  });
  const parsed = parseAndValidateAiResponse(responseText);

  return {
    rewrite: mode === "rewrite" || mode === "master" ? parsed.rewrite : null,
    feedback: parsed.feedback,
    score: parsed.score
  };
}

function normalizePromptMode(mode) {
  return ["master", "rewrite", "feedback"].includes(mode) ? mode : "feedback";
}

async function callAiWithRetry({ apiKey, providerSettings, promptText, mode }) {
  if (apiKey.startsWith(API_KEY_TEST_PREFIX)) {
    return callDeterministicTestModel({ apiKey, promptText, mode });
  }

  let lastError;

  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      return await callAiProvider({ apiKey, providerSettings, promptText, mode });
    } catch (error) {
      lastError = error;
      const retryable = error.name === "AbortError" || error.status === 408 || error.status === 429 || error.status === 529;
      if (!retryable || attempt === 1) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function callDeterministicTestModel({ apiKey, promptText, mode }) {
  const delayMs = apiKey.includes("slow") ? 350 : 20;
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  if (apiKey.includes("invalid") || /malformed/i.test(promptText)) {
    return "not-json";
  }

  return JSON.stringify({
    rewrite: deterministicRewriteForMode(mode),
    feedback: feedbackForMode(mode),
    score: mode === "master" ? 94 : 88
  });
}

function deterministicRewriteForMode(mode) {
  if (mode === "master") {
    return [
      "You are a domain expert specializing in the user's task.",
      "Objective: produce the requested result with clear assumptions, constraints, and an explicit output format.",
      "Context: use the user's raw request as the source of truth; do not invent facts that are not implied.",
      "Requirements: clarify the goal, identify the hard part, state constraints, define the deliverable, and include a pass/fail acceptance check.",
      "Output: return the final answer in structured sections with concise reasoning only where it improves execution."
    ].join("\n");
  }

  if (mode === "rewrite") {
    return "Rewritten prompt with a clearer goal, context, and output format.";
  }

  return "";
}

function feedbackForMode(mode) {
  if (mode === "master") {
    return [
      "Converted the prompt into a structured master prompt.",
      "Added objective, constraints, output format, and acceptance checks."
    ];
  }

  return ["Add audience context", "Specify the desired output format"];
}

async function callAiProvider({ apiKey, providerSettings, promptText, mode }) {
  switch (providerSettings.provider) {
    case "nvidia":
      return callOpenAiCompatible({
        apiKey,
        endpoint: NVIDIA_ENDPOINT,
        model: providerSettings.model || defaultModelForProvider("nvidia"),
        providerName: "NVIDIA",
        promptText,
        mode,
        jsonMode: false
      });
    case "anthropic":
      return callAnthropic({ apiKey, providerSettings, promptText, mode });
    case "openai":
      return callOpenAiCompatible({
        apiKey,
        endpoint: OPENAI_ENDPOINT,
        model: providerSettings.model || defaultModelForProvider("openai"),
        providerName: "OpenAI",
        promptText,
        mode
      });
    case "openrouter":
      return callOpenAiCompatible({
        apiKey,
        endpoint: OPENROUTER_ENDPOINT,
        model: providerSettings.model || defaultModelForProvider("openrouter"),
        providerName: "OpenRouter",
        promptText,
        mode,
        extraHeaders: {
          "HTTP-Referer": "https://prompt-perfect.local",
          "X-Title": "Prompt Forge"
        }
      });
    case "gemini":
      return callGemini({
        apiKey,
        model: providerSettings.model || defaultModelForProvider("gemini"),
        promptText,
        mode
      });
    case "custom":
      return callOpenAiCompatible({
        apiKey,
        endpoint: providerSettings.endpoint,
        model: providerSettings.model,
        providerName: "Custom AI provider",
        promptText,
        mode
      });
    default:
      throw new Error(`Unsupported AI provider: ${providerSettings.provider}`);
  }
}

async function callAnthropic({ apiKey, providerSettings, promptText, mode }) {
  const { controller, timeoutId } = createTimeoutController(mode, "Anthropic");

  try {
    const response = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: providerSettings.model || defaultModelForProvider("anthropic"),
        max_tokens: maxTokensForMode(mode),
        temperature: temperatureForMode(mode),
        system: buildSystemPrompt(mode),
        messages: [
          {
            role: "user",
            content: buildUserPrompt({ promptText, mode })
          }
        ]
      })
    });

    if (response.status === 529) {
      throw new PromptPerfectApiError("Anthropic overloaded. Retrying once.", 529);
    }

    if (!response.ok) {
      throw new PromptPerfectApiError(`Anthropic request failed with HTTP ${response.status}.`, response.status);
    }

    const data = await response.json();
    return extractAnthropicText(data);
  } catch (error) {
    throw normalizeFetchError(error, "Anthropic", mode);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callOpenAiCompatible({
  apiKey,
  endpoint,
  model,
  providerName,
  promptText,
  mode,
  extraHeaders = {},
  jsonMode = true
}) {
  if (!endpoint || !model) {
    throw new Error(`${providerName} requires an endpoint and model.`);
  }

  const { controller, timeoutId } = createTimeoutController(mode, providerName);

  try {
    const body = {
      model,
      temperature: temperatureForMode(mode),
      max_tokens: maxTokensForMode(mode),
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(mode)
        },
        {
          role: "user",
          content: buildUserPrompt({ promptText, mode })
        }
      ]
    };

    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        ...extraHeaders
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new PromptPerfectApiError(`${providerName} request failed with HTTP ${response.status}.`, response.status);
    }

    const data = await response.json();
    return extractOpenAiCompatibleText(data, providerName);
  } catch (error) {
    throw normalizeFetchError(error, providerName, mode);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGemini({ apiKey, model, promptText, mode }) {
  const { controller, timeoutId } = createTimeoutController(mode, "Gemini");
  const endpoint = `${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: temperatureForMode(mode),
          maxOutputTokens: maxTokensForMode(mode),
          responseMimeType: "application/json"
        },
        systemInstruction: {
          parts: [{ text: buildSystemPrompt(mode) }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: buildUserPrompt({ promptText, mode }) }]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new PromptPerfectApiError(`Gemini request failed with HTTP ${response.status}.`, response.status);
    }

    const data = await response.json();
    return extractGeminiText(data);
  } catch (error) {
    throw normalizeFetchError(error, "Gemini", mode);
  } finally {
    clearTimeout(timeoutId);
  }
}

function createTimeoutController(mode, providerName) {
  const controller = new AbortController();
  const timeoutMs = requestTimeoutForMode(mode);
  const timeoutId = setTimeout(() => {
    const timeoutSeconds = Math.round(timeoutMs / 1000);
    controller.abort(new DOMException(`${providerName} request timed out after ${timeoutSeconds}s.`, "AbortError"));
  }, timeoutMs);

  return { controller, timeoutId };
}

function normalizeFetchError(error, providerName, mode) {
  if (error?.name === "AbortError") {
    const timeoutSeconds = Math.round(requestTimeoutForMode(mode) / 1000);
    return new PromptPerfectApiError(
      `${providerName} request timed out after ${timeoutSeconds}s. Try again, or use Refine for a faster pass.`,
      408
    );
  }

  return error;
}

function buildSystemPrompt(mode) {
  return [
    "You are Prompt Forge, a prompt improvement copilot.",
    "Return only a JSON object matching this exact schema:",
    '{"rewrite":"string","feedback":["string"],"score":0}',
    "The score must be a number from 0 to 100.",
    "For feedback mode, still include rewrite as an empty string.",
    mode === "master"
      ? "For master mode, rewrite must be a complete paste-ready master prompt, not commentary about the prompt."
      : "For rewrite mode, rewrite must be concise and paste-ready."
  ].join(" ");
}

function buildUserPrompt({ promptText, mode }) {
  if (mode === "master") {
    return [
      "Mode: master",
      "Transform the raw prompt into a high-discipline master prompt.",
      "Use the raw prompt as the source of truth and do not invent external facts.",
      "Build the rewritten prompt with these sections when useful:",
      "1. Expert role or operating lens",
      "2. Objective and success condition",
      "3. Context and assumptions",
      "4. Hard part or failure mode to avoid",
      "5. Requirements and negative constraints",
      "6. Output format",
      "7. Acceptance check",
      "Keep it paste-ready for another AI. Make it stronger than the original while staying proportional to the user's request.",
      "Return JSON only.",
      "Raw prompt:",
      promptText
    ].join("\n");
  }

  return [
    `Mode: ${mode}`,
    "Improve the following prompt for clarity, specificity, and answerability.",
    "Prompt:",
    promptText
  ].join("\n");
}

function temperatureForMode(mode) {
  if (mode === "master") {
    return 0.35;
  }

  return mode === "rewrite" ? 0.3 : 0.6;
}

function maxTokensForMode(mode) {
  return mode === "master" ? MASTER_MAX_TOKENS : MAX_TOKENS;
}

function requestTimeoutForMode(mode) {
  return mode === "master" ? MASTER_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}

function extractAnthropicText(data) {
  const text = Array.isArray(data?.content)
    ? data.content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("")
        .trim()
    : "";

  if (!text) {
    throw new PromptPerfectParseError("Anthropic response did not include a text block.");
  }

  return text;
}

function extractOpenAiCompatibleText(data, providerName) {
  const text = data?.choices?.[0]?.message?.content;

  if (typeof text !== "string" || !text.trim()) {
    throw new PromptPerfectParseError(`${providerName} response did not include message content.`);
  }

  return text.trim();
}

function extractGeminiText(data) {
  const text = data?.candidates?.[0]?.content?.parts
    ?.filter((part) => typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();

  if (!text) {
    throw new PromptPerfectParseError("Gemini response did not include text content.");
  }

  return text;
}

export function parseAndValidateAiResponse(rawText) {
  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new PromptPerfectParseError("AI response was not valid JSON.", error);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PromptPerfectParseError("AI response must be a JSON object.");
  }

  if (typeof parsed.rewrite !== "string") {
    throw new PromptPerfectParseError("AI response is missing rewrite:string.");
  }

  if (!Array.isArray(parsed.feedback) || parsed.feedback.some((item) => typeof item !== "string")) {
    throw new PromptPerfectParseError("AI response is missing feedback:string[].");
  }

  if (typeof parsed.score !== "number" || parsed.score < 0 || parsed.score > 100) {
    throw new PromptPerfectParseError("AI response is missing score:number between 0 and 100.");
  }

  return {
    rewrite: parsed.rewrite,
    feedback: parsed.feedback,
    score: parsed.score
  };
}

async function saveApiKey(apiKey) {
  const normalized = String(apiKey || "").trim();
  if (!normalized) {
    throw new Error("API key is required.");
  }

  const record = await encryptApiKey(normalized);
  await setValueWithSchemaGuard(API_KEY_RECORD_KEY, record);
  return { hasApiKey: true };
}

async function clearApiKey() {
  await setValueWithSchemaGuard(API_KEY_RECORD_KEY, null);
  return { hasApiKey: false };
}

async function getApiKey() {
  const items = await storageGet(API_KEY_RECORD_KEY);
  const record = items[API_KEY_RECORD_KEY];

  if (!record?.ciphertext) {
    throw new Error("AI provider API key is not configured.");
  }

  const apiKey = await decryptApiKey(record);
  if (!apiKey) {
    throw new Error("AI provider API key could not be decrypted.");
  }

  return apiKey;
}

async function openSidePanel(sender) {
  const tabId = sender?.tab?.id;

  if (!chrome.sidePanel?.open || typeof tabId !== "number") {
    return { opened: false };
  }

  await chrome.sidePanel.open({ tabId });
  return { opened: true };
}

async function ensureCryptoSeed() {
  await assertSchemaVersion();

  const items = await storageGet([CRYPTO_SALT_KEY, INSTALL_SECRET_KEY]);
  const patch = {};

  if (!items[CRYPTO_SALT_KEY]) {
    patch[CRYPTO_SALT_KEY] = bytesToBase64(randomBytes(16));
  }

  if (!items[INSTALL_SECRET_KEY]) {
    patch[INSTALL_SECRET_KEY] = bytesToBase64(randomBytes(32));
  }

  if (Object.keys(patch).length > 0) {
    await setValuesWithSchemaGuard(patch);
  }
}

async function encryptApiKey(apiKey) {
  await ensureCryptoSeed();

  const key = await deriveAesKey();
  const iv = randomBytes(12);
  const plaintextBytes = new TextEncoder().encode(apiKey);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    plaintextBytes
  );

  return {
    alg: "AES-GCM",
    kdf: "PBKDF2",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
    testKey: apiKey.startsWith(API_KEY_TEST_PREFIX)
  };
}

async function decryptApiKey(record) {
  const key = await deriveAesKey();
  const iv = base64ToBytes(record.iv);
  const ciphertext = base64ToBytes(record.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

async function deriveAesKey() {
  const items = await storageGet([CRYPTO_SALT_KEY, INSTALL_SECRET_KEY]);
  const salt = base64ToBytes(items[CRYPTO_SALT_KEY]);
  const secretBytes = base64ToBytes(items[INSTALL_SECRET_KEY]);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 210000,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
