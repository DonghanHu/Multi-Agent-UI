import React, { useRef, useState } from "react";

export default function Dropzone({ onFiles, accept = "application/pdf", multiple = true }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDrag(false);
    const files = Array.from(e.dataTransfer.files || []);
    const filtered = files.filter((f) => (accept ? f.type === accept : true));
    onFiles(multiple ? filtered : filtered.slice(0, 1));
  }

  return (
    <div
      className={"dropzone " + (drag ? "dragover" : "")}
      onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      aria-label="Upload PDFs"
      tabIndex={0}
    >
      <div className="dz-title">Drag & Drop PDFs here</div>
      <div className="dz-sub">or click to browse your computer</div>
      <div className="spacer" />
      <span className="pill">PDF only</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          onFiles(files);
          e.target.value = null;
        }}
      />
    </div>
  );
}
