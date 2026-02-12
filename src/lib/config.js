const STORAGE_KEY = "cyberxercise_demo_config_v1";

export function normalizeBaseUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/$/, "");
}

export function loadApiBaseUrl() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "http://localhost:8000";
    const parsed = JSON.parse(raw);
    return normalizeBaseUrl(parsed?.apiBaseUrl || "http://localhost:8000");
  } catch {
    return "http://localhost:8000";
  }
}

export function saveApiBaseUrl(apiBaseUrl) {
  const normalized = normalizeBaseUrl(apiBaseUrl);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiBaseUrl: normalized }));
  return normalized;
}

export function httpToWsBase(httpBase) {
  const b = normalizeBaseUrl(httpBase);
  if (b.startsWith("https://")) return b.replace("https://", "wss://");
  if (b.startsWith("http://")) return b.replace("http://", "ws://");
  return b;
}
