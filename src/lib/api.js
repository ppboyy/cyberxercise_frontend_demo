import { normalizeBaseUrl } from "./config";

async function parseResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!text) return null;
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

export async function apiRequest(
  apiBaseUrl,
  path,
  { method = "GET", body, headers = {} } = {},
) {
  const base = normalizeBaseUrl(apiBaseUrl);
  const url = `${base}${path}`;

  const finalHeaders = { ...headers };
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await parseResponse(res);
  if (!res.ok) {
    const message =
      typeof data === "string" ? data : data?.detail || "Request failed";
    const err = new Error(`${res.status} ${message}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function login(apiBaseUrl, { username, password }) {
  return apiRequest(apiBaseUrl, "/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export async function createSession(
  apiBaseUrl,
  jwt,
  { maxParticipants = 10, durationSeconds = null } = {},
) {
  return apiRequest(apiBaseUrl, "/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: {
      max_participants: maxParticipants,
      duration_seconds: durationSeconds,
    },
  });
}

export async function getSession(apiBaseUrl, jwt, sessionId) {
  return apiRequest(apiBaseUrl, `/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function listParticipants(apiBaseUrl, jwt, sessionId) {
  return apiRequest(
    apiBaseUrl,
    `/sessions/${encodeURIComponent(sessionId)}/participants`,
    {
      headers: { Authorization: `Bearer ${jwt}` },
    },
  );
}

export async function listMessages(apiBaseUrl, jwt, sessionId) {
  return apiRequest(
    apiBaseUrl,
    `/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      headers: { Authorization: `Bearer ${jwt}` },
    },
  );
}

export async function startSession(apiBaseUrl, jwt, sessionId) {
  return apiRequest(
    apiBaseUrl,
    `/sessions/${encodeURIComponent(sessionId)}/start`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
    },
  );
}

export async function endSession(apiBaseUrl, jwt, sessionId) {
  return apiRequest(
    apiBaseUrl,
    `/sessions/${encodeURIComponent(sessionId)}/end`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
    },
  );
}

export async function join(apiBaseUrl, { teamId, displayName }) {
  return apiRequest(apiBaseUrl, "/join", {
    method: "POST",
    body: { team_id: teamId, display_name: displayName },
  });
}

export async function setReady(apiBaseUrl, participantToken, isReady) {
  return apiRequest(apiBaseUrl, "/participant/ready", {
    method: "POST",
    headers: { "X-Participant-Token": participantToken },
    body: { is_ready: isReady },
  });
}

export async function submitMessage(apiBaseUrl, participantToken, content) {
  return apiRequest(apiBaseUrl, "/participant/message", {
    method: "POST",
    headers: { "X-Participant-Token": participantToken },
    body: { content },
  });
}

export async function leave(apiBaseUrl, participantToken) {
  return apiRequest(apiBaseUrl, "/participant/leave", {
    method: "POST",
    headers: { "X-Participant-Token": participantToken },
  });
}
