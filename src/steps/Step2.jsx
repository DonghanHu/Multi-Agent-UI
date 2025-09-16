// src/steps/Step2.jsx
import React, { useState } from "react";
import Dropzone from "../components/Dropzone.jsx";
import FileList from "../components/FileList.jsx";

export default function Step2({
  paperFiles,
  setPaperFiles,
  task,
  setTask,
  paperResults,
  setPaperResults,
  paperBusy,
  generatePapers,
  generateStakeholders,
  savePaper,
  saveStakeholders,
  handleNextFromStep2,
}) {
  const [combineBusyIdx, setCombineBusyIdx] = useState(null);

  function isTupleResult(r) {
    return (
      Array.isArray(r?.data) &&
      r.data.every(
        (st) => typeof st?.name === "string" && Array.isArray(st?.pairs)
      )
    );
  }

  function updatePaperResults(updater) {
    setPaperResults((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      updater(copy);
      return copy;
    });
  }

  async function combineSimilar(idx) {
    try {
      setCombineBusyIdx(idx); // mark busy for this card
      const r = paperResults[idx];
      if (!isTupleResult(r)) {
        alert("Combine is only available when results are stakeholder tuples.");
        return;
      }
      const resp = await fetch("/api/papers/stakeholders/combine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: r.data }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const merged = Array.isArray(data?.merged) ? data.merged : [];
      updatePaperResults((copy) => {
        copy[idx].data = merged;
      });
    } catch (e) {
      alert(e.message || "Failed to combine stakeholders.");
    } finally {
      setCombineBusyIdx(null); // clear busy
    }
  }

  return (
    <div className="card grid" style={{ gap: 16 }}>
      <h2>Step 2 — Upload Research Papers → Analysis and Stakeholder Tuples</h2>
      <div className="muted">
        Add PDFs and a Task Description. <em>Extract Stakeholders</em>.
      </div>

      {/* Step 2 uploader (same UX as Step 1) */}
      <Dropzone
        onFiles={(newFiles) => setPaperFiles((prev) => [...prev, ...newFiles])}
      />
      <FileList
        files={paperFiles}
        onRemove={(idx) =>
          setPaperFiles((prev) => prev.filter((_, i) => i !== idx))
        }
        onClear={() => setPaperFiles([])}
      />

      <label>
        <div className="muted" style={{ margin: "6px 0" }}>
          Task Description (what you want from these papers)
        </div>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="e.g., Extract methods applicable to my study; identify gaps; relate to X"
        />
      </label>

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          className="btn"
          disabled={paperBusy}
          onClick={generateStakeholders}
        >
          {paperBusy ? "Extracting…" : "Extract Stakeholders (tuples)"}
        </button>
      </div>

      {paperResults.length > 0 && (
        <>
          <div className="grid" style={{ gap: 16 }}>
            <h3 className="muted-strong">Editable Results</h3>

            {paperResults.map((r, idx) => {
              const tupleMode = isTupleResult(r);
              const isCombiningThis = combineBusyIdx === idx;

              return (
                <div key={idx} className="qa-item grid" style={{ gap: 12 }}>
                  <div
                    className="row"
                    style={{
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      <strong>{r.file}</strong>
                      <span className="muted mono">{r.filename}</span>
                      {isCombiningThis && (
                        <span className="pill" aria-live="polite">Combining…</span>
                      )}
                    </div>

                    <div className="row" style={{ gap: 8 }}>
                      {tupleMode ? (
                        <>
                          <span className="pill">Stakeholder Tuples</span>
                          <button
                            className="btn secondary"
                            onClick={() => combineSimilar(idx)}
                            title="Merge/cluster similar stakeholders and deduplicate pairs"
                            disabled={isCombiningThis}
                            aria-busy={isCombiningThis ? "true" : "false"}
                          >
                            {isCombiningThis
                              ? "Combining…"
                              : "Combine Similar Items"}
                          </button>
                          <button
                            className="btn"
                            onClick={() => saveStakeholders(idx)}
                            disabled={isCombiningThis}
                          >
                            Save JSON
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="pill">Analysis</span>
                          <button
                            className="btn"
                            onClick={() => savePaper(idx)}
                          >
                            Save JSON
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Tuples editor */}
                  {tupleMode && (
                    <div className="grid" style={{ gap: 14, opacity: isCombiningThis ? 0.7 : 1 }}>
                      {(r.data || []).map((st, i) => (
                        <div
                          key={i}
                          className="grid"
                          style={{
                            gap: 10,
                            border: "1px solid #eee",
                            borderRadius: 8,
                            padding: 12,
                          }}
                        >
                          <div
                            className="row"
                            style={{
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <strong>Stakeholder {i + 1}</strong>
                            <div className="qa-toolbar">
                              <button
                                className="iconbtn"
                                title="Delete stakeholder"
                                onClick={() =>
                                  updatePaperResults((copy) => {
                                    copy[idx].data.splice(i, 1);
                                  })
                                }
                                disabled={isCombiningThis}
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          <input
                            type="text"
                            value={st.name}
                            placeholder="Stakeholder name"
                            onChange={(e) =>
                              updatePaperResults((copy) => {
                                copy[idx].data[i].name = e.target.value;
                              })
                            }
                            disabled={isCombiningThis}
                          />

                          <textarea
                            value={st.description}
                            placeholder="Description"
                            onChange={(e) =>
                              updatePaperResults((copy) => {
                                copy[idx].data[i].description = e.target.value;
                              })
                            }
                            disabled={isCombiningThis}
                          />

                          <div className="grid" style={{ gap: 8 }}>
                            <div
                              className="row"
                              style={{
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <strong>Dimension–Evidence pairs</strong>
                              <button
                                className="btn secondary"
                                onClick={() =>
                                  updatePaperResults((copy) => {
                                    copy[idx].data[i].pairs.push({
                                      dimension: "",
                                      evidence: "",
                                    });
                                  })
                                }
                                disabled={isCombiningThis}
                              >
                                + Add Pair
                              </button>
                            </div>

                            {(st.pairs || []).map((p, j) => (
                              <div key={j} className="row" style={{ gap: 8 }}>
                                <input
                                  type="text"
                                  value={p.dimension}
                                  placeholder="Dimension"
                                  onChange={(e) =>
                                    updatePaperResults((copy) => {
                                      copy[idx].data[i].pairs[j].dimension =
                                        e.target.value;
                                    })
                                  }
                                  style={{ flex: 1 }}
                                  disabled={isCombiningThis}
                                />
                                <input
                                  type="text"
                                  value={p.evidence}
                                  placeholder="Evidence"
                                  onChange={(e) =>
                                    updatePaperResults((copy) => {
                                      copy[idx].data[i].pairs[j].evidence =
                                        e.target.value;
                                    })
                                  }
                                  style={{ flex: 2 }}
                                  disabled={isCombiningThis}
                                />
                                <button
                                  className="iconbtn"
                                  title="Delete pair"
                                  onClick={() =>
                                    updatePaperResults((copy) => {
                                      copy[idx].data[i].pairs.splice(j, 1);
                                    })
                                  }
                                  disabled={isCombiningThis}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      <div className="row" style={{ gap: 8 }}>
                        <button
                          className="btn secondary"
                          onClick={() =>
                            updatePaperResults((copy) => {
                              if (!Array.isArray(copy[idx].data))
                                copy[idx].data = [];
                              copy[idx].data.push({
                                name: "",
                                description: "",
                                pairs: [],
                              });
                            })
                          }
                          disabled={isCombiningThis}
                        >
                          + Add Stakeholder
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Analysis editor (kept, though you removed the analyze action) */}
                  {!tupleMode && (
                    <div className="grid" style={{ gap: 12 }}>
                      <input
                        type="text"
                        placeholder="Title (optional)"
                        value={r.data.title || ""}
                        onChange={(e) => {
                          const copy = [...paperResults];
                          copy[idx] = {
                            ...copy[idx],
                            data: { ...copy[idx].data, title: e.target.value },
                          };
                          setPaperResults(copy);
                        }}
                      />

                      <label>
                        Summary
                        <textarea
                          value={r.data.summary || ""}
                          onChange={(e) => {
                            const copy = [...paperResults];
                            copy[idx] = {
                              ...copy[idx],
                              data: {
                                ...copy[idx].data,
                                summary: e.target.value,
                              },
                            };
                            setPaperResults(copy);
                          }}
                        />
                      </label>

                      <label>
                        Relevance to Task
                        <textarea
                          value={r.data.relevanceToTask || ""}
                          onChange={(e) => {
                            const copy = [...paperResults];
                            copy[idx] = {
                              ...copy[idx],
                              data: {
                                ...copy[idx].data,
                                relevanceToTask: e.target.value,
                              },
                            };
                            setPaperResults(copy);
                          }}
                        />
                      </label>

                      <div className="grid">
                        <div
                          className="row"
                          style={{ justifyContent: "space-between" }}
                        >
                          <strong>Key Findings</strong>
                          <button
                            className="btn secondary"
                            onClick={() => {
                              const copy = [...paperResults];
                              const arr = [
                                ...(copy[idx].data.keyFindings || []),
                              ];
                              arr.push("");
                              copy[idx].data.keyFindings = arr;
                              setPaperResults(copy);
                            }}
                          >
                            Add
                          </button>
                        </div>
                        {(r.data.keyFindings || []).map((item, i) => (
                          <input
                            key={i}
                            type="text"
                            value={item}
                            onChange={(e) => {
                              const copy = [...paperResults];
                              const arr = [
                                ...(copy[idx].data.keyFindings || []),
                              ];
                              arr[i] = e.target.value;
                              copy[idx].data.keyFindings = arr;
                              setPaperResults(copy);
                            }}
                          />
                        ))}
                      </div>

                      <div className="grid">
                        <div
                          className="row"
                          style={{ justifyContent: "space-between" }}
                        >
                          <strong>Limitations</strong>
                          <button
                            className="btn secondary"
                            onClick={() => {
                              const copy = [...paperResults];
                              const arr = [
                                ...(copy[idx].data.limitations || []),
                              ];
                              arr.push("");
                              copy[idx].data.limitations = arr;
                              setPaperResults(copy);
                            }}
                          >
                            Add
                          </button>
                        </div>
                        {(r.data.limitations || []).map((item, i) => (
                          <input
                            key={i}
                            type="text"
                            value={item}
                            onChange={(e) => {
                              const copy = [...paperResults];
                              const arr = [
                                ...(copy[idx].data.limitations || []),
                              ];
                              arr[i] = e.target.value;
                              copy[idx].data.limitations = arr;
                              setPaperResults(copy);
                            }}
                          />
                        ))}
                      </div>

                      <div className="grid">
                        <div
                          className="row"
                          style={{ justifyContent: "space-between" }}
                        >
                          <strong>Potential Citations</strong>
                          <button
                            className="btn secondary"
                            onClick={() => {
                              const copy = [...paperResults];
                              const arr = [
                                ...(copy[idx].data.potentialCitations || []),
                              ];
                              arr.push("");
                              copy[idx].data.potentialCitations = arr;
                              setPaperResults(copy);
                            }}
                          >
                            Add
                          </button>
                        </div>
                        {(r.data.potentialCitations || []).map((item, i) => (
                          <input
                            key={i}
                            type="text"
                            value={item}
                            onChange={(e) => {
                              const copy = [...paperResults];
                              const arr = [
                                ...(copy[idx].data.potentialCitations || []),
                              ];
                              arr[i] = e.target.value;
                              copy[idx].data.potentialCitations = arr;
                              setPaperResults(copy);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="sticky-actions">
            <button className="btn" onClick={handleNextFromStep2}>
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
