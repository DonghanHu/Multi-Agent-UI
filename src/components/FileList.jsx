import React from "react";

export default function FileList({ files, onRemove, onClear }) {
  if (!files?.length) return null;

  const fmt = (n) => {
    if (n > 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + " MB";
    if (n > 1024) return (n / 1024).toFixed(0) + " KB";
    return n + " B";
  };

  return (
    <div>
      <table className="files-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Size</th>
            <th style={{ width: 90 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f, i) => (
            <tr key={i}>
              <td>{f.name}</td>
              <td className="muted">{fmt(f.size)}</td>
              <td>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    if (onRemove) onRemove(i);
                  }}
                  title="Remove this file"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <button
          type="button"
          className="btn secondary"
          onClick={() => onClear?.()}
        >
          Clear All
        </button>
      </div>
    </div>
  );
}
