import { useEffect, useMemo, useRef, useState } from "react";
import "../App.css";
import { loadApiBaseUrl } from "../lib/config";
import { join, leave, setReady, submitMessage } from "../lib/api";
import { connectParticipantWs } from "../lib/ws";

export default function ParticipantPage() {
  const apiBaseUrl = useMemo(() => loadApiBaseUrl(), []);

  const [teamId, setTeamId] = useState("");
  const [displayName, setDisplayName] = useState("Alice");

  const [statusText, setStatusText] = useState("");

  const [participantToken, setParticipantToken] = useState("");
  const [sessionStatus, setSessionStatus] = useState("lobby");
  const [isReady, setIsReady] = useState(false);

  const [messages, setMessages] = useState([]);
  const [messageDraft, setMessageDraft] = useState("Hello instructor");

  const [, setWsStatus] = useState("disconnected");
  const wsConnRef = useRef(null);

  const joined = Boolean(participantToken);

  function disconnectWs() {
    wsConnRef.current?.close?.();
    wsConnRef.current = null;
    setWsStatus("disconnected");
  }

  function connectWs(currentTeamId, token) {
    if (wsConnRef.current) return;
    wsConnRef.current = connectParticipantWs(apiBaseUrl, currentTeamId, token, {
      onStatus: setWsStatus,
      onEvent: (ev) => {
        const t = ev?.type;
        if (t === "session_started") setSessionStatus("running");
        if (t === "session_ended") {
          setSessionStatus("ended");
          setStatusText("Session ended. Returning to join page...");
          disconnectWs();
          setTimeout(() => {
            setParticipantToken("");
            setIsReady(false);
            setMessages([]);
            setStatusText("");
            setSessionStatus("lobby");
          }, 1200);
        }
        if (t === "message_submitted") {
          const msg = ev?.data?.message;
          const p = ev?.data?.participant;
          if (msg && p) {
            setMessages((prev) => [
              ...prev,
              {
                id: msg.id,
                createdAt: msg.created_at,
                displayName: p.display_name,
                content: msg.content,
              },
            ]);
          }
        }
      },
    });
  }

  useEffect(() => {
    return () => disconnectWs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container">
      <h1>Participant</h1>
      <div className="hint">
        Backend: <span className="code">{apiBaseUrl}</span>
      </div>

      <section>
        <h2>Join</h2>
        {!joined ? (
          <div className="grid">
            <div className="card">
              <label>
                Team ID
                <input
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  placeholder="ABCDEF"
                />
              </label>
              <label>
                Display name
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </label>
              <div className="buttons">
                <button
                  onClick={async () => {
                    try {
                      setStatusText("");
                      const tid = teamId.trim().toUpperCase();
                      const name = displayName.trim();
                      const data = await join(apiBaseUrl, {
                        teamId: tid,
                        displayName: name,
                      });
                      setParticipantToken(String(data.participant_token || ""));
                      setSessionStatus("lobby");
                      setIsReady(false);
                      setMessages([]);
                      setStatusText(`Joined as ${name}.`);
                      disconnectWs();
                      connectWs(tid, String(data.participant_token || ""));
                    } catch (e) {
                      setStatusText(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Join
                </button>
              </div>
              {statusText ? <div className="hint">{statusText}</div> : null}
            </div>

            <div className="card">
              <div className="hint">
                After joining, you can ready/unready and send messages. Live
                updates connect automatically.
              </div>
            </div>
          </div>
        ) : (
          <div className="grid">
            <div className="card">
              <h3>Status</h3>
              <div className="row">
                <span>Session:</span>{" "}
                <span className="code">{sessionStatus}</span>
              </div>
              {statusText ? <div className="hint">{statusText}</div> : null}
              <div className="buttons">
                <button
                  onClick={async () => {
                    try {
                      setStatusText("");
                      await leave(apiBaseUrl, participantToken);
                      setParticipantToken("");
                      setIsReady(false);
                      setMessages([]);
                      disconnectWs();
                    } catch (e) {
                      setStatusText(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Leave
                </button>
              </div>
            </div>

            <div className="card">
              <h3>Ready</h3>
              <div className="buttons">
                <button
                  onClick={async () => {
                    try {
                      setStatusText("");
                      await setReady(apiBaseUrl, participantToken, true);
                      setIsReady(true);
                    } catch (e) {
                      setStatusText(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Ready
                </button>
                <button
                  onClick={async () => {
                    try {
                      setStatusText("");
                      await setReady(apiBaseUrl, participantToken, false);
                      setIsReady(false);
                    } catch (e) {
                      setStatusText(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Unready
                </button>
              </div>
              <div className="hint small">
                Current:{" "}
                <span className="code">{isReady ? "ready" : "not ready"}</span>
              </div>
            </div>

            <div className="card">
              <h3>Message</h3>
              <label>
                Message
                <input
                  value={messageDraft}
                  onChange={(e) => setMessageDraft(e.target.value)}
                />
              </label>
              <div className="buttons">
                <button
                  onClick={async () => {
                    try {
                      setStatusText("");
                      const content = messageDraft.trim();
                      await submitMessage(
                        apiBaseUrl,
                        participantToken,
                        content,
                      );
                      setMessageDraft("");
                    } catch (e) {
                      setStatusText(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Send
                </button>
              </div>
              <div className="hint">
                Messages are allowed only when the session is running.
              </div>
            </div>
          </div>
        )}
      </section>

      {joined ? (
        <section>
          <h2>Messages</h2>
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
        </section>
      ) : null}
    </div>
  );
}
