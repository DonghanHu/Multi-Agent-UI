// src/steps/Step3.jsx
import React from "react";

export default function Step3({
  task,
  paperResults,
  personasResults, setPersonasResults,
  personasBusy,
  // (buildAgents / runInitialEvaluation intentionally not used here anymore)
  generatePersonas, savePersonas,
  onUnlockStep4
}) {
  function updatePersonasResults(updater) {
    setPersonasResults(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      updater(copy);
      return copy;
    });
  }

  return (
    <div className="card grid" style={{ gap: 16 }}>
      <h2>Step 3 — Personas</h2>
      <p className="muted">
        Generate personas (five key attributes) from stakeholder tuples.
        When done, click <em>Finalize &amp; Save</em> to unlock Step 4.
      </p>

      {/* Personas controls */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={generatePersonas} disabled={personasBusy}>
          {personasBusy ? "Generating Personas…" : "Generate Personas (from Stakeholders)"}
        </button>
        {!!personasResults.length && <span className="pill">Personas ready</span>}
      </div>

      {/* Personas editor */}
      {personasResults.length > 0 && (
        <div className="grid" style={{ gap: 16 }}>
          <h3 className="muted-strong">Personas (editable)</h3>
          {personasResults.map((paper, pIdx) => (
            <div key={pIdx} className="qa-item grid" style={{ gap: 12 }}>
              <div className="row" style={{ justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <strong>{paper.file}</strong>
                  <span className="muted mono" style={{ marginLeft: 8 }}>{paper.filename}</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn secondary" onClick={() => savePersonas(pIdx)}>Save JSON</button>
                  {/* Unlock Step 4 explicitly */}
                  <button className="btn" onClick={onUnlockStep4}>Finalize &amp; Save (unlock Step 4)</button>
                </div>
              </div>

              {Object.entries(paper.data || {}).map(([stakeholderName, personas], sIdx) => (
                <div key={sIdx} className="stakeholder" style={{ background:'#fbfbfb' }}>
                  <div className="stakeholder-header">
                    <strong>Stakeholder: {stakeholderName}</strong>
                    <button
                      className="btn secondary"
                      onClick={() => {
                        updatePersonasResults(copy => {
                          (copy[pIdx].data[stakeholderName] ||= []).push({
                            personaName: "",
                            demographicInformation: "",
                            perspective: "",
                            specialty: "",
                            psychologicalTraits: "",
                            socialRelationships: ""
                          });
                        });
                      }}
                    >
                      + Add Persona
                    </button>
                  </div>

                  {(personas || []).map((pers, i) => (
                    <div key={i} className="stakeholder" style={{ marginTop: 10 }}>
                      <div className="stakeholder-header">
                        <strong>Persona {i + 1}</strong>
                        <button
                          className="iconbtn"
                          title="Delete persona"
                          onClick={() => {
                            updatePersonasResults(copy => {
                              copy[pIdx].data[stakeholderName].splice(i, 1);
                            });
                          }}
                        >✕</button>
                      </div>

                      <input
                        type="text"
                        value={pers.personaName || ""}
                        placeholder="Persona name"
                        onChange={(e) => {
                          updatePersonasResults(copy => {
                            copy[pIdx].data[stakeholderName][i].personaName = e.target.value;
                          });
                        }}
                      />

                      <textarea
                        value={pers.demographicInformation || ""}
                        placeholder="Demographic Information"
                        onChange={(e) => {
                          updatePersonasResults(copy => {
                            copy[pIdx].data[stakeholderName][i].demographicInformation = e.target.value;
                          });
                        }}
                      />

                      <textarea
                        value={pers.perspective || ""}
                        placeholder="Perspective (rephrase the stakeholder dimension)"
                        onChange={(e) => {
                          updatePersonasResults(copy => {
                            copy[pIdx].data[stakeholderName][i].perspective = e.target.value;
                          });
                        }}
                      />

                      <input
                        type="text"
                        value={pers.specialty || ""}
                        placeholder="Specialty aligned with the evaluation task"
                        onChange={(e) => {
                          updatePersonasResults(copy => {
                            copy[pIdx].data[stakeholderName][i].specialty = e.target.value;
                          });
                        }}
                      />

                      <input
                        type="text"
                        value={pers.psychologicalTraits || ""}
                        placeholder="Psychological Traits"
                        onChange={(e) => {
                          updatePersonasResults(copy => {
                            copy[pIdx].data[stakeholderName][i].psychologicalTraits = e.target.value;
                          });
                        }}
                      />

                      <textarea
                        value={pers.socialRelationships || ""}
                        placeholder="Social Relationships with other stakeholder types"
                        onChange={(e) => {
                          updatePersonasResults(copy => {
                            copy[pIdx].data[stakeholderName][i].socialRelationships = e.target.value;
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
