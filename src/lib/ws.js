import { httpToWsBase, normalizeBaseUrl } from "./config";

export function connectInstructorWs(
  apiBaseUrl,
  sessionId,
  jwt,
  { onEvent, onStatus } = {},
) {
  const wsBase = httpToWsBase(normalizeBaseUrl(apiBaseUrl));
  const url = `${wsBase}/ws/instructor/${encodeURIComponent(sessionId)}?access_token=${encodeURIComponent(jwt)}`;

  const ws = new WebSocket(url);
  const ping = setInterval(() => {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    } catch {
      // ignore
    }
  }, 25000);

  const setStatus = (s) => onStatus && onStatus(s);

  setStatus("connecting");
  ws.onopen = () => setStatus("connected");
  ws.onerror = () => setStatus("error");
  ws.onclose = (ev) => {
    clearInterval(ping);
    setStatus(`closed (${ev.code})`);
  };
  ws.onmessage = (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      onEvent && onEvent(payload);
    } catch {
      // ignore non-json
    }
  };

  return {
    ws,
    close() {
      clearInterval(ping);
      try {
        ws.close(1000);
      } catch {
        // ignore
      }
    },
  };
}

export function connectParticipantWs(
  apiBaseUrl,
  teamId,
  participantToken,
  { onEvent, onStatus } = {},
) {
  const wsBase = httpToWsBase(normalizeBaseUrl(apiBaseUrl));
  const url = `${wsBase}/ws/participant/${encodeURIComponent(teamId)}?token=${encodeURIComponent(participantToken)}`;

  const ws = new WebSocket(url);
  const ping = setInterval(() => {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    } catch {
      // ignore
    }
  }, 25000);

  const setStatus = (s) => onStatus && onStatus(s);

  setStatus("connecting");
  ws.onopen = () => setStatus("connected");
  ws.onerror = () => setStatus("error");
  ws.onclose = (ev) => {
    clearInterval(ping);
    setStatus(`closed (${ev.code})`);
  };
  ws.onmessage = (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      onEvent && onEvent(payload);
    } catch {
      // ignore non-json
    }
  };

  return {
    ws,
    close() {
      clearInterval(ping);
      try {
        ws.close(1000);
      } catch {
        // ignore
      }
    },
  };
}
