import React, { useState } from "react";
import Dropzone from "../components/Dropzone.jsx";
import FileList from "../components/FileList.jsx";

function dedupePairs(pairs) {
  const seen = new Set();
  return pairs.filter(p => {
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
  qaBusy,
  generateQA,        // existing PDF flow (handled in App.jsx)
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

  async function generateQAFromText() {
    const text = manualText.trim();
    if (!text) {
      alert("Please paste or type some text first.");
      return;
    }
    setManualBusy(true);
    try {
      const resp = await fetch("/api/qa/generate_from_text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const pairs = Array.isArray(data?.data?.pairs) ? data.data.pairs : [];
      if (!pairs.length) {
        alert("No Q&A pairs were generated from the text.");
        return;
      }
      // ✅ merge with existing pairs + de-dupe
      setQaPairs(prev => dedupePairs([...prev, ...pairs]));
      // If you want to reflect the filename from text generation in UI,
      // pass setQaFilename in props from App.jsx and call setQaFilename(data.filename).
      // For now we just log it:
      if (data?.filename) {
        console.log("[Step1] Generated-from-text filename:", data.filename);
      }
    } catch (e) {
      alert(e?.message || "Failed to generate Q&A from text.");
    } finally {
      setManualBusy(false);
    }
  }

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

      {/* ----- Option A: Upload PDFs (existing) ----- */}
      <Dropzone
        onFiles={(newFiles) => setQaFiles((prev) => [...prev, ...newFiles])}
      />
      <FileList
        files={qaFiles}
        onRemove={(idx) =>
          setQaFiles((prev) => prev.filter((_, i) => i !== idx))
        }
        onClear={() => setQaFiles([])}
      />

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn" disabled={qaBusy} onClick={generateQA}>
          {qaBusy ? "Generating…" : "Generate Q&A (from PDFs)"}
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

      {/* ----- Option B: Manual Text (new) ----- */}
      <div className="grid" style={{ gap: 8, marginTop: 8 }}>
        <h3 className="muted-strong">Or paste text directly</h3>
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="Paste or type source text here (an abstract, section, or any content)…"
          style={{ width: "100%", minHeight: 140, fontFamily: "inherit", fontSize: "inherit" }}
        />
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={generateQAFromText} disabled={manualBusy}>
            {manualBusy ? "Generating…" : "Generate Q&A (from Text)"}
          </button>
          <span className="muted">
            This sends the text to <code>/api/qa/generate_from_text</code> and merges the returned pairs with the current list.
          </span>
        </div>
      </div>

      {!!qaPairs.length && (
        <div className="grid" style={{ gap: 14 }}>
          <h3 className="muted-strong">Edit Q&amp;A</h3>
          {qaPairs.map((qa, i) => (
            <div key={i} className="qa-item grid" style={{ gap: 8 }}>
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <strong>Q{String(i + 1).padStart(2, "0")}</strong>
                <div className="qa-toolbar">
                  <button
                    className="iconbtn"
                    onClick={() => movePair(i, -1)}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="iconbtn"
                    onClick={() => movePair(i, +1)}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    className="iconbtn"
                    onClick={() => duplicatePair(i)}
                    title="Duplicate"
                  >
                    ⎘
                  </button>
                  <button
                    className="iconbtn"
                    onClick={() => deletePair(i)}
                    title="Delete"
                  >
                    ✕
                  </button>
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
              onClick={() =>
                setQaPairs([...qaPairs, { question: "", answer: "" }])
              }
            >
              + Add New Pair
            </button>
          </div>
        </div>
      )}

      <div className="sticky-actions">
        <button
          className="btn secondary"
          onClick={saveQA}
          disabled={!qaPairs.length}
        >
          Save JSON
        </button>
        <button
          className="btn"
          onClick={handleNextFromStep1}
          disabled={!qaPairs.length}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
