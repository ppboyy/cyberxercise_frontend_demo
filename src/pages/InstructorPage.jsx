import { useEffect, useMemo, useRef, useState } from "react";
import "../App.css";
import { loadApiBaseUrl } from "../lib/config";
import {
  createSession,
  endSession,
  listMessages,
  listParticipants,
  login,
  startSession,
} from "../lib/api";
import { connectInstructorWs } from "../lib/ws";

function formatParticipantRow(p) {
  return {
    id: p.id,
    displayName: p.display_name,
    isReady: Boolean(p.is_ready),
    joinedAt: p.joined_at,
    leftAt: p.left_at,
  };
}

function formatMessageRow(m) {
  return {
    id: m.id,
    displayName: m.display_name,
    content: m.content,
    createdAt: m.created_at,
  };
}

export default function InstructorPage() {
  const apiBaseUrl = useMemo(() => loadApiBaseUrl(), []);

  const [username, setUsername] = useState("instructor1");
  const [password, setPassword] = useState("password123");
  const [jwt, setJwt] = useState("");

  const [statusText, setStatusText] = useState("");

  const [sessionId, setSessionId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [sessionStatus, setSessionStatus] = useState("lobby");

  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);

  const [, setWsStatus] = useState("disconnected");
  const wsConnRef = useRef(null);

  const canAct = Boolean(jwt && sessionId);

  async function refreshParticipants({ sessionIdOverride, jwtOverride } = {}) {
    const effectiveJwt = jwtOverride ?? jwt;
    const effectiveSessionId = sessionIdOverride ?? sessionId;
    if (!effectiveJwt || !effectiveSessionId) return;
    const data = await listParticipants(
      apiBaseUrl,
      effectiveJwt,
      effectiveSessionId,
    );
    setParticipants(
      Array.isArray(data?.participants)
        ? data.participants.map(formatParticipantRow)
        : [],
    );
  }

  async function refreshMessages({ sessionIdOverride, jwtOverride } = {}) {
    const effectiveJwt = jwtOverride ?? jwt;
    const effectiveSessionId = sessionIdOverride ?? sessionId;
    if (!effectiveJwt || !effectiveSessionId) return;
    const data = await listMessages(
      apiBaseUrl,
      effectiveJwt,
      effectiveSessionId,
    );
    setMessages(
      Array.isArray(data?.messages) ? data.messages.map(formatMessageRow) : [],
    );
  }

  function disconnectWs() {
    wsConnRef.current?.close?.();
    wsConnRef.current = null;
    setWsStatus("disconnected");
  }

  function connectWs({ sessionIdOverride, jwtOverride } = {}) {
    const effectiveJwt = jwtOverride ?? jwt;
    const effectiveSessionId = sessionIdOverride ?? sessionId;

    if (!effectiveJwt || !effectiveSessionId) return;
    if (wsConnRef.current) return;

    wsConnRef.current = connectInstructorWs(
      apiBaseUrl,
      effectiveSessionId,
      effectiveJwt,
      {
        onStatus: setWsStatus,
        onEvent: (ev) => {
          const t = ev?.type;
          if (
            t === "participant_joined" ||
            t === "participant_left" ||
            t === "participant_ready_changed"
          ) {
            refreshParticipants({
              sessionIdOverride: effectiveSessionId,
              jwtOverride: effectiveJwt,
            }).catch(() => {});
          }
          if (t === "message_submitted") {
            refreshMessages({
              sessionIdOverride: effectiveSessionId,
              jwtOverride: effectiveJwt,
            }).catch(() => {});
          }
          if (t === "session_started" || t === "session_ended") {
            refreshParticipants({
              sessionIdOverride: effectiveSessionId,
              jwtOverride: effectiveJwt,
            }).catch(() => {});
            refreshMessages({
              sessionIdOverride: effectiveSessionId,
              jwtOverride: effectiveJwt,
            }).catch(() => {});
            if (t === "session_ended") {
              setSessionStatus("ended");
              // Session lifecycle is over; stop live updates.
              disconnectWs();
            }
            if (t === "session_started") setSessionStatus("running");
          }
        },
      },
    );

    // initial fetch
    refreshParticipants({
      sessionIdOverride: effectiveSessionId,
      jwtOverride: effectiveJwt,
    }).catch(() => {});
    refreshMessages({
      sessionIdOverride: effectiveSessionId,
      jwtOverride: effectiveJwt,
    }).catch(() => {});
  }

  useEffect(() => {
    return () => disconnectWs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!jwt || !sessionId || sessionStatus === "ended") {
      if (wsConnRef.current) disconnectWs();
      return;
    }

    connectWs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwt, sessionId, sessionStatus]);

  return (
    <div className="container">
      <h1>Instructor</h1>
      <div className="hint">
        Backend: <span className="code">{apiBaseUrl}</span>
      </div>

      <section>
        <h2>Login</h2>
        <div className="grid">
          <div className="card">
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <div className="buttons">
              <button
                onClick={async () => {
                  try {
                    setStatusText("");
                    const data = await login(apiBaseUrl, {
                      username: username.trim(),
                      password,
                    });
                    setJwt(String(data.access_token || ""));
                    setStatusText("Logged in.");
                  } catch (e) {
                    setStatusText(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                Login
              </button>
            </div>
          </div>

          <div className="card">
            <h3>Session</h3>
            <div className="buttons">
              <button
                onClick={async () => {
                  try {
                    setStatusText("");
                    if (!jwt) throw new Error("Please login first.");
                    const data = await createSession(apiBaseUrl, jwt, {
                      maxParticipants: 10,
                      durationSeconds: 900,
                    });
                    const newSessionId = String(data.session_id || "");
                    setSessionId(newSessionId);
                    setTeamId(String(data.team_id || ""));
                    setSessionStatus(String(data.status || "lobby"));
                    setStatusText("Session created.");
                    disconnectWs();
                    // Connect immediately using returned session id (state updates are async).
                    connectWs({
                      sessionIdOverride: newSessionId,
                      jwtOverride: jwt,
                    });
                  } catch (e) {
                    setStatusText(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                Create session
              </button>
            </div>
            <div className="row">
              <span>Team ID:</span>{" "}
              <span className="code">{teamId || "—"}</span>
            </div>
            <div className="row">
              <span>Session:</span>{" "}
              <span className="code">{sessionStatus}</span>
            </div>
          </div>

          <div className="card">
            <h3>Controls</h3>
            <div className="buttons">
              <button
                disabled={!canAct}
                onClick={async () => {
                  try {
                    setStatusText("");
                    const data = await startSession(apiBaseUrl, jwt, sessionId);
                    setSessionStatus(String(data.status || "running"));
                    setStatusText("Session started.");
                    refreshMessages().catch(() => {});
                  } catch (e) {
                    setStatusText(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                Start session
              </button>
              <button
                disabled={!canAct}
                onClick={async () => {
                  try {
                    setStatusText("");
                    const data = await endSession(apiBaseUrl, jwt, sessionId);
                    setSessionStatus(String(data.status || "ended"));
                    setStatusText("Session ended.");
                    disconnectWs();
                  } catch (e) {
                    setStatusText(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                End session
              </button>
              <button
                disabled={!canAct}
                onClick={() => refreshParticipants().catch(() => {})}
              >
                Refresh participants
              </button>
              <button
                disabled={!canAct}
                onClick={() => refreshMessages().catch(() => {})}
              >
                Refresh messages
              </button>
            </div>
          </div>
        </div>

        {statusText ? <div className="hint">{statusText}</div> : null}
      </section>

      <section>
        <h2>Lobby</h2>
        <div className="grid">
          <div className="card">
            <h3>Participants</h3>
            {participants.length === 0 ? (
              <div className="hint">No participants yet.</div>
            ) : (
              <div className="panelTableWrap">
                <table className="panelTable">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Ready</th>
                      <th>Joined</th>
                      <th>Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => (
                      <tr key={p.id}>
                        <td>{p.displayName}</td>
                        <td>{p.isReady ? "yes" : "no"}</td>
                        <td className="mono">{p.joinedAt}</td>
                        <td className="mono">{p.leftAt || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Messages</h3>
            {messages.length === 0 ? (
              <div className="hint">No messages yet.</div>
            ) : (
              <div className="panelList">
                {messages.map((m) => (
                  <div key={m.id} className="panelListItem">
                    <div className="panelListMeta">
                      <span className="mono">{m.createdAt}</span>
                      <span className="mono">{m.displayName}</span>
                    </div>
                    <div className="panelListBody">{m.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
