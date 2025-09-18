// src/steps/Step1.jsx
import React, { useState } from "react";
import Dropzone from "../components/Dropzone.jsx";
import FileList from "../components/FileList.jsx";

function dedupePairs(pairs) {
  const seen = new Set();
  return pairs.filter((p) => {
    const key = (p.question || "") + "||" + (p.answer || "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function Step1({
  qaFiles,
  setQaFiles,
  qaPairs,
  setQaPairs,
  qaFilename,
  qaBusy,          // busy from the PDF flow (parent/App.jsx)
  generateQA,      // PDF flow (parent/App.jsx) — must return a Promise
  saveQA,
  handleNextFromStep1,
}) {
  const [manualText, setManualText] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  function movePair(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= qaPairs.length) return;
    const copy = [...qaPairs];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setQaPairs(copy);
  }

  function duplicatePair(i) {
    const copy = [...qaPairs];
    copy.splice(i + 1, 0, { ...copy[i] });
    setQaPairs(copy);
  }

  function deletePair(i) {
    setQaPairs(qaPairs.filter((_, idx) => idx !== i));
  }

  // One button to run both generators (PDFs + Text)
  async function generateQATogether() {
    const hasPDFs = (qaFiles?.length ?? 0) > 0;
    const textTrimmed = manualText.trim();
    const hasText = textTrimmed.length > 0;

    if (!hasPDFs && !hasText) {
      alert("Please upload PDFs and/or paste some text first.");
      return;
    }

    setManualBusy(true);
    try {
      // 1) PDFs → Q&A (delegated to parent)
      if (hasPDFs && typeof generateQA === "function") {
        await generateQA(); // should update qaPairs via parent logic
      }

      // 2) Text → Q&A (call API directly, then merge + de-dupe)
      if (hasText) {
        const resp = await fetch("/api/qa/generate_from_text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textTrimmed }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err?.error || `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        const textPairs = Array.isArray(data?.data?.pairs) ? data.data.pairs : [];
        if (textPairs.length) {
          setQaPairs((prev) => dedupePairs([...(prev || []), ...textPairs]));
        } else {
          // Optional: let the user know if nothing came back from text
          // alert("No Q&A pairs were generated from the text.");
        }
      }
    } catch (e) {
      alert(e?.message || "Failed to generate Q&A.");
    } finally {
      setManualBusy(false);
    }
  }

  const generating = qaBusy || manualBusy;

  return (
    <div className="card grid" style={{ gap: 16 }}>
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <h2 style={{ margin: 0 }}>
          Step 1 — Upload SourceText PDFs → Generate Q&amp;A
        </h2>
        <span className="pill">
          Q&amp;A Pairs:{" "}
          <span className="counter" style={{ marginLeft: 8 }}>
            {qaPairs.length}
          </span>
        </span>
      </div>

      {/* ----- Upload PDFs ----- */}
      <Dropzone onFiles={(newFiles) => setQaFiles((prev) => [...prev, ...newFiles])} />
      <FileList
        files={qaFiles}
        onRemove={(idx) => setQaFiles((prev) => prev.filter((_, i) => i !== idx))}
        onClear={() => setQaFiles([])}
      />

      {/* ----- Paste Text ----- */}
      <div className="grid" style={{ gap: 8, marginTop: 8 }}>
        <h3 className="muted-strong">Or paste text directly</h3>
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="Paste or type source text here (an abstract, section, or any content)…"
          style={{ width: "100%", minHeight: 140, fontFamily: "inherit", fontSize: "inherit" }}
        />
        <span className="muted">
          The single button below will generate from PDFs (if any) and from this text (if present), then merge and de-dupe.
        </span>
      </div>

      {/* ----- Generate + Save ----- */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button className="btn" disabled={generating} onClick={generateQATogether}>
          {generating ? "Generating…" : "Generate Q&A"}
        </button>
        {!!qaPairs.length && (
          <button className="btn secondary" onClick={saveQA}>
            Save JSON
          </button>
        )}
        {qaFilename && (
          <span className="muted">
            Last saved as: <span className="mono">{qaFilename}</span>
          </span>
        )}
      </div>

      {/* ----- Editable List ----- */}
      {!!qaPairs.length && (
        <div className="grid" style={{ gap: 14, marginTop: 12 }}>
          <h3 className="muted-strong">Edit Q&amp;A</h3>
          {qaPairs.map((qa, i) => (
            <div key={i} className="qa-item grid" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <strong>Q{String(i + 1).padStart(2, "0")}</strong>
                <div className="qa-toolbar">
                  <button className="iconbtn" onClick={() => movePair(i, -1)} title="Move up">↑</button>
                  <button className="iconbtn" onClick={() => movePair(i, +1)} title="Move down">↓</button>
                  <button className="iconbtn" onClick={() => duplicatePair(i)} title="Duplicate">⎘</button>
                  <button className="iconbtn" onClick={() => deletePair(i)} title="Delete">✕</button>
                </div>
              </div>

              <div className="qs-grid">
                <input
                  type="text"
                  value={qa.question}
                  onChange={(e) => {
                    const copy = [...qaPairs];
                    copy[i] = { ...copy[i], question: e.target.value };
                    setQaPairs(copy);
                  }}
                  placeholder="Question"
                />
                <textarea
                  value={qa.answer}
                  onChange={(e) => {
                    const copy = [...qaPairs];
                    copy[i] = { ...copy[i], answer: e.target.value };
                    setQaPairs(copy);
                  }}
                  placeholder="Answer"
                />
              </div>
            </div>
          ))}

          <div className="row">
            <button
              className="btn secondary"
              onClick={() => setQaPairs([...qaPairs, { question: "", answer: "" }])}
            >
              + Add New Pair
            </button>
          </div>
        </div>
      )}

      {/* ----- Sticky actions ----- */}
      <div className="sticky-actions">
        <button className="btn secondary" onClick={saveQA} disabled={!qaPairs.length}>
          Save JSON
        </button>
        <button className="btn" onClick={handleNextFromStep1} disabled={!qaPairs.length}>
          Next →
        </button>
      </div>
    </div>
  );
}
