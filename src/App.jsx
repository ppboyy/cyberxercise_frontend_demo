import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const STORAGE_KEY = "cyberxercise_demo_config_v1";

function normalizeBaseUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/$/, "");
}

function httpToWsBase(httpBase) {
  const b = normalizeBaseUrl(httpBase);
  if (b.startsWith("https://")) return b.replace("https://", "wss://");
  if (b.startsWith("http://")) return b.replace("http://", "ws://");
  return b;
}

function nowIso() {
  return new Date().toISOString();
}

function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return "http://localhost:8000";
      const parsed = JSON.parse(raw);
      return normalizeBaseUrl(parsed?.apiBaseUrl || "http://localhost:8000");
    } catch {
      return "http://localhost:8000";
    }
  });

  const [jwt, setJwt] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [teamId, setTeamId] = useState("");

  const [participantToken, setParticipantToken] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [participantSessionId, setParticipantSessionId] = useState("");

  const [savedParticipants, setSavedParticipants] = useState([]);
  const [activeParticipantKey, setActiveParticipantKey] = useState("");

  const [regUsername, setRegUsername] = useState("instructor1");
  const [regPassword, setRegPassword] = useState("password123");
  const [loginUsername, setLoginUsername] = useState("instructor1");
  const [loginPassword, setLoginPassword] = useState("password123");

  const [maxParticipants, setMaxParticipants] = useState(5);
  const [durationSeconds, setDurationSeconds] = useState(900);
  const [sessionIdInput, setSessionIdInput] = useState("");

  const [joinTeamId, setJoinTeamId] = useState("");
  const [joinDisplayName, setJoinDisplayName] = useState("Alice");

  const [messageContent, setMessageContent] = useState("Hello instructor");

  const [wsInstructorSessionId, setWsInstructorSessionId] = useState("");
  const [wsParticipantTeamId, setWsParticipantTeamId] = useState("");

  const [instructorWsStatus, setInstructorWsStatus] = useState("disconnected");
  const [participantWsStatus, setParticipantWsStatus] =
    useState("disconnected");

  const [instructorParticipants, setInstructorParticipants] = useState([]);
  const [instructorMessages, setInstructorMessages] = useState([]);
  const [participantsUpdatedAt, setParticipantsUpdatedAt] = useState("");
  const [messagesUpdatedAt, setMessagesUpdatedAt] = useState("");

  const outputRef = useRef(null);
  const instructorWsRef = useRef(null);
  const participantWsRef = useRef(null);
  const instructorPingRef = useRef(null);
  const participantPingRef = useRef(null);

  const refreshingParticipantsRef = useRef(false);
  const refreshingMessagesRef = useRef(false);
  const queuedParticipantsRefreshRef = useRef(false);
  const queuedMessagesRefreshRef = useRef(false);

  const wsBaseUrl = useMemo(() => httpToWsBase(apiBaseUrl), [apiBaseUrl]);

  const activeParticipant = useMemo(() => {
    if (!activeParticipantKey) return null;
    return (
      savedParticipants.find((p) => p.key === activeParticipantKey) || null
    );
  }, [activeParticipantKey, savedParticipants]);

  function appendLog(line) {
    if (!outputRef.current) return;
    outputRef.current.textContent += `[${nowIso()}] ${line}\n`;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }

  function appendJson(title, obj) {
    const safe = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    appendLog(`${title}\n${safe}`);
  }

  async function apiFetch(path, { method = "GET", body, headers = {} } = {}) {
    const base = normalizeBaseUrl(apiBaseUrl);
    const url = `${base}${path}`;

    const finalHeaders = {
      ...headers,
    };
    if (body !== undefined) finalHeaders["Content-Type"] = "application/json";

    appendLog(`HTTP ${method} ${url}`);
    if (body !== undefined) appendJson("Request body:", body);

    const res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    let data = null;
    if (text) {
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      } else {
        data = text;
      }
    }

    if (!res.ok) {
      appendJson(`Response ${res.status}:`, data);
      throw new Error(`HTTP ${res.status}`);
    }

    appendJson(`Response ${res.status}:`, data);
    return data;
  }

  function requireJwt() {
    if (!jwt) throw new Error("Instructor JWT missing. Login first.");
    return jwt;
  }

  function requireParticipantToken() {
    if (!participantToken)
      throw new Error("Participant token missing. Join first.");
    return participantToken;
  }

  function effectiveSessionId() {
    const v = String(sessionIdInput || "").trim();
    return v || sessionId || participantSessionId;
  }

  async function refreshInstructorParticipants() {
    if (refreshingParticipantsRef.current) {
      queuedParticipantsRefreshRef.current = true;
      return;
    }

    const token = requireJwt();
    const id = String(
      wsInstructorSessionId || effectiveSessionId() || "",
    ).trim();
    if (!id) throw new Error("Session ID required to fetch participants");

    refreshingParticipantsRef.current = true;
    try {
      const data = await apiFetch(
        `/sessions/${encodeURIComponent(id)}/participants`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setInstructorParticipants(
        Array.isArray(data?.participants) ? data.participants : [],
      );
      setParticipantsUpdatedAt(nowIso());
    } finally {
      refreshingParticipantsRef.current = false;
      if (queuedParticipantsRefreshRef.current) {
        queuedParticipantsRefreshRef.current = false;
        await refreshInstructorParticipants();
      }
    }
  }

  async function refreshInstructorMessages() {
    if (refreshingMessagesRef.current) {
      queuedMessagesRefreshRef.current = true;
      return;
    }

    const token = requireJwt();
    const id = String(
      wsInstructorSessionId || effectiveSessionId() || "",
    ).trim();
    if (!id) throw new Error("Session ID required to fetch messages");

    refreshingMessagesRef.current = true;
    try {
      const data = await apiFetch(
        `/sessions/${encodeURIComponent(id)}/messages`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setInstructorMessages(Array.isArray(data?.messages) ? data.messages : []);
      setMessagesUpdatedAt(nowIso());
    } finally {
      refreshingMessagesRef.current = false;
      if (queuedMessagesRefreshRef.current) {
        queuedMessagesRefreshRef.current = false;
        await refreshInstructorMessages();
      }
    }
  }

  function stopPing(ref) {
    if (ref.current) {
      clearInterval(ref.current);
      ref.current = null;
    }
  }

  function startPing(ws, ref) {
    stopPing(ref);
    ref.current = setInterval(() => {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      } catch {
        // ignore
      }
    }, 25000);
  }

  function disconnectInstructorWs() {
    const ws = instructorWsRef.current;
    if (!ws) return;
    appendLog("Instructor WS disconnect.");
    try {
      ws.close(1000);
    } catch {
      // ignore
    }
  }

  function disconnectParticipantWs() {
    const ws = participantWsRef.current;
    if (!ws) return;
    appendLog("Participant WS disconnect.");
    try {
      ws.close(1000);
    } catch {
      // ignore
    }
  }

  function switchActiveParticipant(nextKey) {
    setActiveParticipantKey(nextKey);
  }

  function connectInstructorWs() {
    const sessionIdForWs = String(wsInstructorSessionId || "").trim();
    const token = requireJwt();
    if (!sessionIdForWs)
      throw new Error("Session ID is required for instructor WS.");

    if (
      instructorWsRef.current &&
      (instructorWsRef.current.readyState === WebSocket.OPEN ||
        instructorWsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      appendLog("Instructor WS already connected/connecting.");
      return;
    }

    const url = `${wsBaseUrl}/ws/instructor/${encodeURIComponent(sessionIdForWs)}?access_token=${encodeURIComponent(
      token,
    )}`;
    appendLog(`WS connect (instructor): ${url}`);

    const ws = new WebSocket(url);
    instructorWsRef.current = ws;
    setInstructorWsStatus("connecting");

    ws.onopen = () => {
      setInstructorWsStatus("connected");
      appendLog("Instructor WS connected.");
      startPing(ws, instructorPingRef);

      safeRun(async () => {
        await refreshInstructorParticipants();
        await refreshInstructorMessages();
      });
    };
    ws.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        appendJson("WS (instructor) event:", payload);

        const eventType = payload?.type;
        if (
          eventType === "participant_joined" ||
          eventType === "participant_left" ||
          eventType === "participant_ready_changed"
        ) {
          safeRun(async () => {
            await refreshInstructorParticipants();
          });
        }

        if (eventType === "message_submitted") {
          safeRun(async () => {
            await refreshInstructorMessages();
          });
        }

        if (eventType === "session_started" || eventType === "session_ended") {
          safeRun(async () => {
            await refreshInstructorParticipants();
            await refreshInstructorMessages();
          });
        }
      } catch {
        appendLog(`WS (instructor) message: ${String(ev.data)}`);
      }
    };
    ws.onerror = () => {
      appendLog("Instructor WS error.");
    };
    ws.onclose = (ev) => {
      stopPing(instructorPingRef);
      instructorWsRef.current = null;
      setInstructorWsStatus(`closed (${ev.code})`);
      appendLog(`Instructor WS closed: code=${ev.code}`);
    };
  }

  function connectParticipantWs() {
    const teamIdForWs = String(wsParticipantTeamId || "").trim();
    const token = requireParticipantToken();
    if (!teamIdForWs)
      throw new Error("Team ID is required for participant WS.");

    if (
      participantWsRef.current &&
      (participantWsRef.current.readyState === WebSocket.OPEN ||
        participantWsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      appendLog("Participant WS already connected/connecting.");
      return;
    }

    const url = `${wsBaseUrl}/ws/participant/${encodeURIComponent(teamIdForWs)}?token=${encodeURIComponent(
      token,
    )}`;
    appendLog(`WS connect (participant): ${url}`);

    const ws = new WebSocket(url);
    participantWsRef.current = ws;
    setParticipantWsStatus("connecting");

    ws.onopen = () => {
      setParticipantWsStatus("connected");
      appendLog("Participant WS connected.");
      startPing(ws, participantPingRef);
    };
    ws.onmessage = (ev) => {
      try {
        appendJson("WS (participant) event:", JSON.parse(ev.data));
      } catch {
        appendLog(`WS (participant) message: ${String(ev.data)}`);
      }
    };
    ws.onerror = () => {
      appendLog("Participant WS error.");
    };
    ws.onclose = (ev) => {
      stopPing(participantPingRef);
      participantWsRef.current = null;
      setParticipantWsStatus(`closed (${ev.code})`);
      appendLog(`Participant WS closed: code=${ev.code}`);
    };
  }

  async function safeRun(fn) {
    try {
      await fn();
    } catch (e) {
      appendLog(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function saveConfig() {
    const normalized = normalizeBaseUrl(apiBaseUrl);
    setApiBaseUrl(normalized);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ apiBaseUrl: normalized }),
    );
    appendLog(`Saved API base URL: ${normalized}`);
  }

  useEffect(() => {
    // helpful default syncing
    if (!sessionIdInput && sessionId) setSessionIdInput(sessionId);
    if (!wsInstructorSessionId && sessionId)
      setWsInstructorSessionId(sessionId);
    if (!joinTeamId && teamId) setJoinTeamId(teamId);
    if (!wsParticipantTeamId && (joinTeamId || teamId))
      setWsParticipantTeamId(joinTeamId || teamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, teamId, participantToken]);

  useEffect(() => {
    // When switching active participant, update the active token/id/session.
    // Also disconnect participant WS so reconnect uses the new token.
    if (!activeParticipant) return;
    setParticipantToken(String(activeParticipant.token || ""));
    setParticipantId(String(activeParticipant.participantId || ""));
    setParticipantSessionId(String(activeParticipant.sessionId || ""));
    if (!wsParticipantTeamId) {
      setWsParticipantTeamId(String(activeParticipant.teamId || ""));
    }
    disconnectParticipantWs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeParticipantKey]);

  useEffect(() => {
    appendLog(
      "Ready. Suggested flow: register → login → create session → connect instructor WS → join → connect participant WS → ready → start → message → list messages → end → leave.",
    );

    return () => {
      stopPing(instructorPingRef);
      stopPing(participantPingRef);
      try {
        instructorWsRef.current?.close(1000);
      } catch {
        // ignore
      }
      try {
        participantWsRef.current?.close(1000);
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container">
      <h1>Cyberxercise API Demo</h1>

      <section>
        <h2>Config</h2>
        <label>
          API Base URL
          <input
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
          />
        </label>
        <div className="buttons">
          <button onClick={() => safeRun(async () => saveConfig())}>
            Save
          </button>
        </div>
        <div className="hint">
          Backend should be running at the URL above. Make sure backend CORS
          allows <span className="code">http://localhost:5173</span>.
        </div>
      </section>

      <section>
        <h2>Instructor</h2>
        <div className="grid">
          <div className="card">
            <h3>Register (dev-only)</h3>
            <label>
              Username
              <input
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
              />
            </label>
            <div className="buttons">
              <button
                onClick={() =>
                  safeRun(async () => {
                    await apiFetch("/auth/register", {
                      method: "POST",
                      body: {
                        username: String(regUsername || "").trim(),
                        password: String(regPassword || ""),
                      },
                    });
                  })
                }
              >
                POST /auth/register
              </button>
            </div>
            <div className="hint">
              Requires{" "}
              <span className="code">ALLOW_INSTRUCTOR_REGISTER=true</span> in
              backend .env.
            </div>
          </div>

          <div className="card">
            <h3>Login</h3>
            <label>
              Username
              <input
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </label>
            <div className="buttons">
              <button
                onClick={() =>
                  safeRun(async () => {
                    const data = await apiFetch("/auth/login", {
                      method: "POST",
                      body: {
                        username: String(loginUsername || "").trim(),
                        password: String(loginPassword || ""),
                      },
                    });
                    setJwt(String(data.access_token || ""));
                  })
                }
              >
                POST /auth/login
              </button>
            </div>
            <div className="row">
              <span>JWT:</span>
              <span className="code" title={jwt}>
                {jwt}
              </span>
            </div>
          </div>

          <div className="card">
            <h3>Create Session</h3>
            <label>
              Max participants
              <input
                type="number"
                min={1}
                max={10}
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Number(e.target.value))}
              />
            </label>
            <label>
              Duration seconds (optional)
              <input
                type="number"
                min={1}
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value))}
              />
            </label>
            <div className="buttons">
              <button
                onClick={() =>
                  safeRun(async () => {
                    const token = requireJwt();
                    const body = {
                      max_participants: Number(maxParticipants),
                      duration_seconds: durationSeconds
                        ? Number(durationSeconds)
                        : null,
                    };
                    const data = await apiFetch("/sessions", {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}` },
                      body,
                    });
                    setSessionId(String(data.session_id || ""));
                    setTeamId(String(data.team_id || ""));
                    if (!sessionIdInput)
                      setSessionIdInput(String(data.session_id || ""));
                    if (!wsInstructorSessionId)
                      setWsInstructorSessionId(String(data.session_id || ""));
                    if (!joinTeamId) setJoinTeamId(String(data.team_id || ""));
                    if (!wsParticipantTeamId)
                      setWsParticipantTeamId(String(data.team_id || ""));
                  })
                }
              >
                POST /sessions
              </button>
            </div>
            <div className="row">
              <span>Session ID:</span>
              <span className="code" title={sessionId}>
                {sessionId}
              </span>
            </div>
            <div className="row">
              <span>Team ID:</span>
              <span className="code" title={teamId}>
                {teamId}
              </span>
            </div>
          </div>

          <div className="card">
            <h3>Session Actions</h3>
            <label>
              Session ID
              <input
                value={sessionIdInput}
                onChange={(e) => setSessionIdInput(e.target.value)}
                placeholder="uuid"
              />
            </label>
            <div className="buttons">
              <button
                onClick={() =>
                  safeRun(async () => {
                    const token = requireJwt();
                    const id = effectiveSessionId();
                    if (!id) throw new Error("Session ID required");
                    await apiFetch(`/sessions/${encodeURIComponent(id)}`, {
                      headers: { Authorization: `Bearer ${token}` },
                    });
                  })
                }
              >
                GET /sessions/{"{id}"}
              </button>
              <button
                onClick={() =>
                  safeRun(async () => {
                    const token = requireJwt();
                    const id = effectiveSessionId();
                    if (!id) throw new Error("Session ID required");
                    await apiFetch(
                      `/sessions/${encodeURIComponent(id)}/participants`,
                      {
                        headers: { Authorization: `Bearer ${token}` },
                      },
                    );
                  })
                }
              >
                GET /sessions/{"{id}"}/participants
              </button>
              <button
                onClick={() =>
                  safeRun(async () => {
                    const token = requireJwt();
                    const id = effectiveSessionId();
                    if (!id) throw new Error("Session ID required");
                    await apiFetch(
                      `/sessions/${encodeURIComponent(id)}/start`,
                      {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                      },
                    );
                  })
                }
              >
                POST /sessions/{"{id}"}/start
              </button>
              <button
                onClick={() =>
                  safeRun(async () => {
                    const token = requireJwt();
                    const id = effectiveSessionId();
                    if (!id) throw new Error("Session ID required");
                    await apiFetch(`/sessions/${encodeURIComponent(id)}/end`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}` },
                    });
                  })
                }
              >
                POST /sessions/{"{id}"}/end
              </button>
              <button
                onClick={() =>
                  safeRun(async () => {
                    const token = requireJwt();
                    const id = effectiveSessionId();
                    if (!id) throw new Error("Session ID required");
                    await apiFetch(
                      `/sessions/${encodeURIComponent(id)}/messages`,
                      {
                        headers: { Authorization: `Bearer ${token}` },
                      },
                    );
                  })
                }
              >
                GET /sessions/{"{id}"}/messages
              </button>
            </div>
          </div>

          <div className="card">
            <h3>Instructor WebSocket</h3>
            <div className="hint">
              Browser WS usually can’t set Authorization headers, so this uses{" "}
              <span className="code">?access_token=</span>.
            </div>
            <label>
              Session ID
              <input
                value={wsInstructorSessionId}
                onChange={(e) => setWsInstructorSessionId(e.target.value)}
                placeholder="uuid"
              />
            </label>
            <div className="buttons">
              <button
                onClick={() => safeRun(async () => connectInstructorWs())}
              >
                Connect
              </button>
              <button
                onClick={() => safeRun(async () => disconnectInstructorWs())}
              >
                Disconnect
              </button>
            </div>
            <div className="row">
              <span>Status:</span>{" "}
              <span className="code">{instructorWsStatus}</span>
            </div>
          </div>

          <div className="card">
            <h3>Live Participants</h3>
            <div className="hint">
              Updates from WS events, and re-fetches{" "}
              <span className="code">GET /sessions/{"{id}"}/participants</span>.
            </div>
            <div className="buttons">
              <button
                onClick={() =>
                  safeRun(async () => {
                    await refreshInstructorParticipants();
                  })
                }
              >
                Refresh now
              </button>
            </div>
            <div className="hint small">
              Last updated:{" "}
              <span className="code">{participantsUpdatedAt || "—"}</span>
            </div>
            {instructorParticipants.length === 0 ? (
              <div className="hint">No participants (or not fetched yet).</div>
            ) : (
              <div className="panelTableWrap">
                <table className="panelTable">
                  <thead>
                    <tr>
                      <th>Display</th>
                      <th>Ready</th>
                      <th>Joined</th>
                      <th>Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instructorParticipants.map((p) => (
                      <tr key={p.id}>
                        <td className="mono" title={p.display_name}>
                          {p.display_name}
                        </td>
                        <td>{p.is_ready ? "yes" : "no"}</td>
                        <td className="mono" title={p.joined_at}>
                          {p.joined_at}
                        </td>
                        <td className="mono" title={p.left_at || ""}>
                          {p.left_at || ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Live Messages</h3>
            <div className="hint">
              Updates from WS events, and re-fetches{" "}
              <span className="code">GET /sessions/{"{id}"}/messages</span>.
            </div>
            <div className="buttons">
              <button
                onClick={() =>
                  safeRun(async () => {
                    await refreshInstructorMessages();
                  })
                }
              >
                Refresh now
              </button>
            </div>
            <div className="hint small">
              Last updated:{" "}
              <span className="code">{messagesUpdatedAt || "—"}</span>
            </div>
            {instructorMessages.length === 0 ? (
              <div className="hint">No messages (or not fetched yet).</div>
            ) : (
              <div className="panelList">
                {instructorMessages.map((m) => (
                  <div key={m.id} className="panelListItem">
                    <div className="panelListMeta">
                      <span className="mono" title={m.created_at}>
                        {m.created_at}
                      </span>
                      <span className="mono" title={m.display_name}>
                        {m.display_name}
                      </span>
                    </div>
                    <div className="panelListBody">{m.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2>Participant</h2>
        <div className="grid">
          <div className="card">
            <h3>Active Participant</h3>
            <div className="hint">
              Participant actions and participant WS use the selected
              participant token.
            </div>
            <label>
              Saved participants
              <select
                value={activeParticipantKey}
                onChange={(e) => switchActiveParticipant(e.target.value)}
              >
                <option value="">(none)</option>
                {savedParticipants.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.displayName} — {p.teamId}
                  </option>
                ))}
              </select>
            </label>
            <div className="buttons">
              <button
                onClick={() =>
                  safeRun(async () => {
                    setSavedParticipants([]);
                    setActiveParticipantKey("");
                    setParticipantToken("");
                    setParticipantId("");
                    setParticipantSessionId("");
                    disconnectParticipantWs();
                  })
                }
              >
                Clear saved
              </button>
              <button
                onClick={() =>
                  safeRun(async () => {
                    if (!activeParticipantKey) return;
                    setSavedParticipants((prev) =>
                      prev.filter((p) => p.key !== activeParticipantKey),
                    );
                    setActiveParticipantKey("");
                    setParticipantToken("");
                    setParticipantId("");
                    setParticipantSessionId("");
                    disconnectParticipantWs();
                  })
                }
              >
                Remove selected
              </button>
            </div>
            <div className="hint small">
              Current token:{" "}
              <span className="code">{participantToken || ""}</span>
            </div>
          </div>

          <div className="card">
            <h3>Join</h3>
            <label>
              Team ID
              <input
                value={joinTeamId}
                onChange={(e) => setJoinTeamId(e.target.value)}
                placeholder="ABCDEF"
              />
            </label>
            <label>
              Display name
              <input
                value={joinDisplayName}
                onChange={(e) => setJoinDisplayName(e.target.value)}
                placeholder="Alice"
              />
            </label>
            <div className="buttons">
              <button
                onClick={() =>
                  safeRun(async () => {
                    const data = await apiFetch("/join", {
                      method: "POST",
                      body: {
                        team_id: String(joinTeamId || "")
                          .trim()
                          .toUpperCase(),
                        display_name: String(joinDisplayName || "").trim(),
                      },
                    });
                    const token = String(data.participant_token || "");
                    const pid = String(data.participant_id || "");
                    const sid = String(data.session_id || "");
                    const tid = String(joinTeamId || "")
                      .trim()
                      .toUpperCase();
                    const name = String(joinDisplayName || "").trim();

                    setParticipantToken(token);
                    setParticipantId(pid);
                    setParticipantSessionId(sid);

                    const key = `${tid}:${pid}`;
                    setSavedParticipants((prev) => {
                      const without = prev.filter((p) => p.key !== key);
                      return [
                        {
                          key,
                          teamId: tid,
                          displayName: name,
                          token,
                          participantId: pid,
                          sessionId: sid,
                        },
                        ...without,
                      ];
                    });
                    setActiveParticipantKey(key);
                    if (!wsParticipantTeamId) setWsParticipantTeamId(tid);
                  })
                }
              >
                POST /join
              </button>
            </div>
            <div className="row">
              <span>Participant token:</span>
              <span className="code" title={participantToken}>
                {participantToken}
              </span>
            </div>
            <div className="row">
              <span>Participant ID:</span>
              <span className="code" title={participantId}>
                {participantId}
              </span>
            </div>
            <div className="row">
              <span>Session ID:</span>
              <span className="code" title={participantSessionId}>
                {participantSessionId}
              </span>
            </div>
          </div>

          <div className="card">
            <h3>Participant WebSocket</h3>
            <label>
              Team ID
              <input
                value={wsParticipantTeamId}
                onChange={(e) => setWsParticipantTeamId(e.target.value)}
                placeholder="ABCDEF"
              />
            </label>
            <div className="buttons">
              <button
                onClick={() => safeRun(async () => connectParticipantWs())}
              >
                Connect
              </button>
              <button
                onClick={() => safeRun(async () => disconnectParticipantWs())}
              >
                Disconnect
              </button>
            </div>
            <div className="row">
              <span>Status:</span>{" "}
              <span className="code">{participantWsStatus}</span>
            </div>
          </div>

          <div className="card">
            <h3>Participant Actions</h3>
            <div className="buttons">
              <button
                onClick={() =>
                  safeRun(async () => {
                    const token = requireParticipantToken();
                    await apiFetch("/participant/ready", {
                      method: "POST",
                      headers: { "X-Participant-Token": token },
                      body: { is_ready: true },
                    });
                  })
                }
              >
                POST /participant/ready (true)
              </button>
              <button
                onClick={() =>
                  safeRun(async () => {
                    const token = requireParticipantToken();
                    await apiFetch("/participant/ready", {
                      method: "POST",
                      headers: { "X-Participant-Token": token },
                      body: { is_ready: false },
                    });
                  })
                }
              >
                POST /participant/ready (false)
              </button>
            </div>
            <label>
              Message
              <input
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
              />
            </label>
            <div className="buttons">
              <button
                onClick={() =>
                  safeRun(async () => {
                    const token = requireParticipantToken();
                    await apiFetch("/participant/message", {
                      method: "POST",
                      headers: { "X-Participant-Token": token },
                      body: { content: String(messageContent || "").trim() },
                    });
                  })
                }
              >
                POST /participant/message
              </button>
              <button
                onClick={() =>
                  safeRun(async () => {
                    const token = requireParticipantToken();
                    await apiFetch("/participant/leave", {
                      method: "POST",
                      headers: { "X-Participant-Token": token },
                    });

                    // Token is revoked after leaving; remove from saved list if present.
                    setSavedParticipants((prev) =>
                      prev.filter((p) => p.token !== token),
                    );
                    setActiveParticipantKey("");
                    setParticipantToken("");
                    setParticipantId("");
                    setParticipantSessionId("");
                    disconnectParticipantWs();
                  })
                }
              >
                POST /participant/leave
              </button>
            </div>
            <div className="hint">
              Token becomes invalid after leaving (revoked). If you disconnect a
              participant WS tab, backend will also best-effort mark them as
              left.
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2>Output</h2>
        <div className="outputWrap">
          <div className="buttons">
            <button
              onClick={() => {
                if (outputRef.current) outputRef.current.textContent = "";
              }}
            >
              Clear
            </button>
            <button
              onClick={() =>
                safeRun(async () => {
                  const text = outputRef.current?.textContent || "";
                  await navigator.clipboard.writeText(text);
                  appendLog("Copied output to clipboard.");
                })
              }
            >
              Copy
            </button>
          </div>
          <div className="hint small">
            WS base auto-derived from API base:{" "}
            <span className="code">{wsBaseUrl}</span>
          </div>
          <pre ref={outputRef} className="output" />
        </div>
      </section>
    </div>
  );
}

export default App;
