// src/steps/Step4.jsx
import React, { useRef, useState } from "react";

/** Utility to download JSON blobs */
function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read an NDJSON (one JSON per line) stream and invoke onLine(json) for each line */
async function streamNDJSON(response, onLine) {
  const reader = response.body?.getReader?.();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        onLine(obj);
      } catch {
        onLine({ type: "warn", message: line });
      }
    }
  }

  // Flush any trailing JSON (not newline-terminated)
  const last = buf.trim();
  if (last) {
    try {
      onLine(JSON.parse(last));
    } catch {
      onLine({ type: "warn", message: last });
    }
  }
}

export default function Step4({
  // artifacts
  qaFilename, qaPairs,
  paperResults,
  personasResults,
  agentsFile, agents,
  setAgentsFile, setAgents,
  evalFile, evaluations, // legacy

  // optional external handlers + states (if you already wired in App.jsx; otherwise we self-manage)
  phase1, phase1Busy, onRunPhase1,
  phase2, phase2Busy, onRunPhase2,
  phase3, phase3Busy, onRunPhase3,
  task
}) {
  // Local fallbacks if parent didn't supply states/handlers
  const [p1Busy, setP1Busy] = useState(false);
  const [p2Busy, setP2Busy] = useState(false);
  const [p3Busy, setP3Busy] = useState(false);

  const [p1, setP1] = useState(null);
  const [p2, setP2] = useState(null);
  const [p3, setP3] = useState(null);

  const [p1Log, setP1Log] = useState([]);
  const [p2Log, setP2Log] = useState([]);
  const [p3Log, setP3Log] = useState([]);

  // auto-scroll refs
  const p1LogRef = useRef(null);
  const p2LogRef = useRef(null);
  const p3LogRef = useRef(null);

  const effectivePhase1 = phase1 ?? p1;
  const effectivePhase2 = phase2 ?? p2;
  const effectivePhase3 = phase3 ?? p3;

  const effectiveP1Busy = (typeof phase1Busy === "boolean" ? phase1Busy : p1Busy);
  const effectiveP2Busy = (typeof phase2Busy === "boolean" ? phase2Busy : p2Busy);
  const effectiveP3Busy = (typeof phase3Busy === "boolean" ? phase3Busy : p3Busy);

  const [creatingAgents, setCreatingAgents] = useState(false);

  async function handleGenerateAgents() {
    if (!Array.isArray(personasResults) || personasResults.length === 0) {
      alert("No personas available. Finish Step 3 first.");
      return;
    }
    try {
      setCreatingAgents(true);
      const resp = await fetch("/api/agents/generate_from_personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personasResults,
          taskDescription: task || ""
        })
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e?.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (typeof setAgents === "function") setAgents(data.agents || []);
      if (typeof setAgentsFile === "function") setAgentsFile(data.filename || "");
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to generate agents.");
    } finally {
      setCreatingAgents(false);
    }
  }

  // Helpers to append log lines + autoscroll
  function pushP1(msg) {
    setP1Log(l => [...l, msg]);
    setTimeout(() => p1LogRef.current?.scrollTo?.(0, p1LogRef.current.scrollHeight), 0);
  }
  function pushP2(msg) {
    setP2Log(l => [...l, msg]);
    setTimeout(() => p2LogRef.current?.scrollTo?.(0, p2LogRef.current.scrollHeight), 0);
  }
  function pushP3(msg) {
    setP3Log(l => [...l, msg]);
    setTimeout(() => p3LogRef.current?.scrollTo?.(0, p3LogRef.current.scrollHeight), 0);
  }

  // Default streaming calls if parent didn’t provide onRunPhase*
  const runPhase1Default = async () => {
    // Clear old state
    setP1(null);
    setP1Busy(true);
    setP1Log([]);
    pushP1({ type: "info", message: "Starting Phase 1… (running phase1Independent.txt per agent)" });

    try {
      const resp = await fetch("/api/debate/phase1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/x-ndjson"
        },
        body: JSON.stringify({ qaPairs, agents })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${resp.status}`);
      }

      // Stream server logs + results
      await streamNDJSON(resp, (line) => {
        if (line.message) pushP1({ type: line.type || "log", message: line.message });
        if (line.partial?.agentId) {
          const agent = agents.find(a => a.agentId === line.partial.agentId);
          pushP1({
            type: "log",
            message: `Received partial score for ${agent?.agentName || agent?.name || line.partial.agentId}: ${line.partial.score}`
          });
        }
        if (line.initialEvaluations) {
          // Final result payload for Phase 1
          setP1({ initialEvaluations: line.initialEvaluations });
        }
      });

      pushP1({ type: "success", message: "Phase 1 finished." });
    } catch (e) {
      pushP1({ type: "error", message: e.message || "Phase 1 failed." });
    } finally {
      setP1Busy(false);
    }
  };

  const runPhase2Default = async () => {
    if (!(effectivePhase1?.initialEvaluations?.length > 0)) {
      pushP2({ type: "warn", message: "Phase 1 results required." });
      return;
    }
    setP2(null);
    setP2Busy(true);
    setP2Log([]);
    pushP2({ type: "info", message: "Starting Phase 2 (debate) …" });

    try {
      const resp = await fetch("/api/debate/phase2", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson" },
        body: JSON.stringify({ qaPairs, agents, phase1: effectivePhase1, maxRounds: 12 })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${resp.status}`);
      }

      await streamNDJSON(resp, (line) => {
        if (line.message) pushP2({ type: line.type || "log", message: line.message });
        if (line.transcript) {
          setP2(prev => ({ ...(prev || {}), transcript: line.transcript }));
        }
        if (line.finalEvaluations) {
          setP2(prev => ({ ...(prev || {}), finalEvaluations: line.finalEvaluations }));
        }
      });

      pushP2({ type: "success", message: "Phase 2 finished." });
    } catch (e) {
      pushP2({ type: "error", message: e.message || "Phase 2 failed." });
    } finally {
      setP2Busy(false);
    }
  };

  const runPhase3Default = async () => {
    if (!(effectivePhase2?.finalEvaluations?.length > 0)) {
      pushP3({ type: "warn", message: "Phase 2 results required." });
      return;
    }
    setP3(null);
    setP3Busy(true);
    setP3Log([]);
    pushP3({ type: "info", message: "Starting Phase 3 (aggregation) …" });

    try {
      const resp = await fetch("/api/debate/phase3", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson" },
        body: JSON.stringify({ qaPairs, agents, phase2: effectivePhase2 })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${resp.status}`);
      }

      await streamNDJSON(resp, (line) => {
        if (line.message) pushP3({ type: line.type || "log", message: line.message });
        if (line.result) {
          setP3(line.result); // { feedback, averageScore }
        }
      });

      pushP3({ type: "success", message: "Phase 3 finished." });
    } catch (e) {
      pushP3({ type: "error", message: e.message || "Phase 3 failed." });
    } finally {
      setP3Busy(false);
    }
  };

  // Trigger wrappers: prefer external handler if provided, otherwise default
  const onPhase1Click = async () => {
    const disabled =
      effectiveP1Busy || !(agents?.length > 0) || !(qaPairs?.length > 0);
    if (disabled) return;
    if (onRunPhase1) return onRunPhase1();
    return runPhase1Default();
  };
  const onPhase2Click = async () => {
    if (onRunPhase2) return onRunPhase2();
    return runPhase2Default();
  };
  const onPhase3Click = async () => {
    if (onRunPhase3) return onRunPhase3();
    return runPhase3Default();
  };

  return (
    <div className="card grid" style={{ gap: 18 }}>
      <h2>Step 4 — Three-Phase Stakeholder Debate</h2>
      <p className="muted">
        First, generate agents (one per persona). Then run Phase 1 (independent evaluations), Phase 2 (multi-turn debate), and Phase 3 (aggregation).
      </p>

      {/* Generate Agents */}
      <section className="grid" style={{ gap: 10 }}>
        <h3>Prepare Agents</h3>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className={`btn ${creatingAgents ? "success" : ""}`}
            onClick={handleGenerateAgents}
            disabled={creatingAgents || !(personasResults?.length > 0)}
            title={!(personasResults?.length > 0) ? "No personas yet" : ""}
          >
            {creatingAgents ? "Creating…" : "Generate Agents"}
          </button>
          {agentsFile && <span className="muted mono">Saved: {agentsFile}</span>}
        </div>

        {!!(agents?.length) && (
          <div className="grid" style={{ gap: 8, maxWidth: "100%", overflow: "hidden" }}>
            <strong className="muted-strong">Generated Agents ({agents.length}) - Using table14_instantiate.txt</strong>
            {agents.map((a) => (
              <div key={a.agentId} className="qa-item grid" style={{ gap: 8, maxWidth: "100%", overflow: "hidden" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{a.agentName || a.name || a.agentId}</strong>
                  <span className="muted mono">ID: {a.agentId}</span>
                </div>
                
                <div className="grid" style={{ gap: 4, maxWidth: "100%", overflow: "hidden" }}>
                  <div className="muted" style={{ wordWrap: "break-word", overflowWrap: "break-word" }}><b>Source File:</b> {a.fromFile}</div>
                  <div className="muted" style={{ wordWrap: "break-word", overflowWrap: "break-word" }}><b>Stakeholder:</b> {a.stakeholder}</div>
                  <div className="muted" style={{ wordWrap: "break-word", overflowWrap: "break-word" }}><b>Demographic:</b> {a.demographicInformation}</div>
                  <div className="muted" style={{ wordWrap: "break-word", overflowWrap: "break-word" }}><b>Perspective:</b> {a.perspective}</div>
                  <div className="muted" style={{ wordWrap: "break-word", overflowWrap: "break-word" }}><b>Specialty:</b> {a.specialty}</div>
                  <div className="muted" style={{ wordWrap: "break-word", overflowWrap: "break-word" }}><b>Psychological Traits:</b> {a.psychologicalTraits}</div>
                  <div className="muted" style={{ wordWrap: "break-word", overflowWrap: "break-word" }}><b>Social Relationships:</b> {a.socialRelationships}</div>
                </div>

                <details style={{ marginTop: "8px", maxWidth: "100%", overflow: "hidden" }}>
                  <summary className="muted" style={{ cursor: "pointer", fontWeight: "bold" }}>
                    📄 Complete Instantiated Prompt (from table14_instantiate.txt)
                  </summary>
                  <div style={{ 
                    background: "#f9fafb", 
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px", 
                    padding: "12px", 
                    marginTop: "8px",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: "13px",
                    lineHeight: "1.5",
                    whiteSpace: "pre-wrap",
                    wordWrap: "break-word",
                    overflowWrap: "break-word",
                    maxHeight: "300px",
                    maxWidth: "100%",
                    overflow: "auto",
                    boxSizing: "border-box"
                  }}>
                    {a.instantiationPrompt || "No instantiated prompt available"}
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>

      <hr />

      {/* PHASE 1 */}
      <section className="grid" style={{ gap: 10 }}>
        <h3>Phase 1 — Independent Evaluations</h3>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className={`btn ${effectiveP1Busy ? "running" : ""}`}
            onClick={onPhase1Click}
            disabled={effectiveP1Busy || !(agents?.length > 0) || !(qaPairs?.length > 0)}
            title={
              !(agents?.length > 0) ? "Build/generate agents first" :
              !(qaPairs?.length > 0) ? "Complete Step 1 (Q&A) first" : ""
            }
          >
            {effectiveP1Busy ? "Running Phase 1…" : "Run Phase 1"}
          </button>
          <span className="muted">
            Runs <code>server/prompts/phase1Independent.txt</code> for each agent. Scores (1–5) + rationale will appear below.
          </span>
        </div>

        {/* live log */}
        <div className="logbox" ref={p1LogRef}>
          {(p1Log.length ? p1Log : [{ type: "hint", message: "Click Run Phase 1 to begin." }]).map((l, i) => (
            <div key={i} className={`log ${l.type || "log"}`}>{l.message}</div>
          ))}
        </div>

        {/* Per-agent result cards */}
        {effectivePhase1?.initialEvaluations?.length > 0 && (
          <div className="grid" style={{ gap: 8, marginTop: 8 }}>
            <strong className="muted-strong">Phase 1 Results</strong>
            {effectivePhase1.initialEvaluations.map((ev, i) => {
              const agent = agents.find(a => a.agentId === ev.agentId);
              return (
                <div key={i} className="qa-item grid" style={{ gap: 6 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                    <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
                      <strong>{agent?.agentName || agent?.name || ev.agentId}</strong>
                      <span className="muted mono">ID: {ev.agentId}</span>
                    </div>
                    <span className="pill">{ev.score}</span>
                  </div>
                  <div className="muted">{ev.rationale}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <hr />

      {/* PHASE 2 */}
      <section className="grid" style={{ gap: 10 }}>
        <h3>Phase 2 — Coordinated Multi-turn Debate</h3>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className={`btn ${effectiveP2Busy ? "running" : ""}`}
            onClick={onPhase2Click}
            disabled={
              effectiveP2Busy ||
              !(agents?.length > 0) ||
              !(qaPairs?.length > 0) ||
              !(effectivePhase1?.initialEvaluations?.length > 0)
            }
            title={!(effectivePhase1?.initialEvaluations?.length > 0) ? "Run Phase 1 first" : ""}
          >
            {effectiveP2Busy ? "Running Phase 2…" : "Start Debate"}
          </button>
          <span className="muted">Coordinator selects speakers; agents may revise their scores.</span>
        </div>

        {/* live log */}
        <div className="logbox" ref={p2LogRef}>
          {(p2Log.length ? p2Log : [{ type: "hint", message: "Run Phase 2 after Phase 1." }]).map((l, i) => (
            <div key={i} className={`log ${l.type || "log"}`}>{l.message}</div>
          ))}
        </div>

        {effectivePhase2?.transcript?.length > 0 && (
          <div className="grid" style={{ gap: 8 }}>
            <strong className="muted-strong">Transcript</strong>
            {effectivePhase2.transcript.map((t, i) => (
              <div key={i} className="row" style={{ gap: 8 }}>
                <span className="mono muted">Round {t.round}</span>
                <span style={{ minWidth: 140, fontWeight: 600 }}>{t.speaker}</span>
                <span>{t.text}</span>
              </div>
            ))}
          </div>
        )}

        {effectivePhase2?.finalEvaluations?.length > 0 && (
          <div className="grid" style={{ gap: 8 }}>
            <strong className="muted-strong">Final Evaluations</strong>
            {effectivePhase2.finalEvaluations.map((ev, i) => {
              const agent = agents.find(a => a.agentId === ev.agentId);
              return (
                <div key={i} className="qa-item grid" style={{ gap: 6 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{agent?.agentName || agent?.name || ev.agentId}</strong>
                    <span className="muted">Final Score: {ev.score}</span>
                  </div>
                  <div className="muted">{ev.rationale}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <hr />

      {/* PHASE 3 */}
      <section className="grid" style={{ gap: 10 }}>
        <h3>Phase 3 — Aggregation</h3>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className={`btn ${effectiveP3Busy ? "running" : ""}`}
            onClick={onPhase3Click}
            disabled={effectiveP3Busy || !(effectivePhase2?.finalEvaluations?.length > 0)}
            title={!(effectivePhase2?.finalEvaluations?.length > 0) ? "Run Phase 2 first" : ""}
          >
            {effectiveP3Busy ? "Running Phase 3…" : "Aggregate Results"}
          </button>
          <span className="muted">Synthesizes qualitative feedback + computes the average score.</span>
        </div>

        {/* live log */}
        <div className="logbox" ref={p3LogRef}>
          {(p3Log.length ? p3Log : [{ type: "hint", message: "Run Phase 3 after Phase 2." }]).map((l, i) => (
            <div key={i} className={`log ${l.type || "log"}`}>{l.message}</div>
          ))}
        </div>

        {effectivePhase3 && (
          <div className="grid" style={{ gap: 8 }}>
            <div className="qa-item grid" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>Average Score</strong>
                <span className="muted">{effectivePhase3.averageScore}</span>
              </div>
              <div className="muted">{effectivePhase3.feedback}</div>
            </div>
          </div>
        )}
      </section>

      <hr />

      {/* Existing exports (optional keep) */}
      <h3>Downloads</h3>
      <div className="grid" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong>Q&A Pairs</strong>
          <button className="btn secondary" onClick={() => downloadJSON(qaFilename || "qa.json", { pairs: qaPairs })}>
            Download
          </button>
        </div>

        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong>Per-paper Results (Analysis or Tuples)</strong>
          <button className="btn secondary" onClick={() => downloadJSON("papers.json", paperResults)}>
            Download
          </button>
        </div>

        {!!(personasResults?.length) && (
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <strong>Personas</strong>
            <button className="btn secondary" onClick={() => downloadJSON("personas.json", personasResults)}>
              Download
            </button>
          </div>
        )}

        {!!(agents?.length) && (
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <strong>Agents</strong>
            <div className="row" style={{ gap: 8 }}>
              {agentsFile && <span className="muted mono">Saved: {agentsFile}</span>}
              <button className="btn secondary" onClick={() => downloadJSON("agents.json", { agents })}>
                Download
              </button>
            </div>
          </div>
        )}

        {!!(evaluations?.length) && (
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <strong>Initial Evaluation Results</strong>
            <div className="row" style={{ gap: 8 }}>
              {evalFile && <span className="muted mono">Saved: {evalFile}</span>}
              <button className="btn secondary" onClick={() => downloadJSON("evaluations.json", { evaluations })}>
                Download
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
