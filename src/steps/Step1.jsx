import React from "react";
import Dropzone from "../components/Dropzone.jsx";
import FileList from "../components/FileList.jsx";

export default function Step1({
  qaFiles,
  setQaFiles,
  qaPairs,
  setQaPairs,
  qaFilename,
  qaBusy,
  generateQA,
  saveQA,
  handleNextFromStep1,
}) {
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

      {/* Step 1 uploader */}
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

      <div className="row">
        <button className="btn" disabled={qaBusy} onClick={generateQA}>
          {qaBusy ? "Generating…" : "Generate Q&A"}
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
