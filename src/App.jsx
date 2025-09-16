import React, { useState } from "react";
import axios from "axios";

import "./App.css";
import Stepper from "./components/Stepper.jsx";
import Step1 from "./steps/Step1.jsx";
import Step2 from "./steps/Step2.jsx";
import Step3 from "./steps/Step3.jsx";
import Step4 from "./steps/Step4.jsx";

export default function App() {
  const [step, setStep] = useState(1);
  const [step1Completed, setStep1Completed] = useState(false);
  const [step2Completed, setStep2Completed] = useState(false);
  const [step4Unlocked, setStep4Unlocked] = useState(false);

  // STEP 1
  const [qaFiles, setQaFiles] = useState([]);
  const [qaPairs, setQaPairs] = useState([]);
  const [qaFilename, setQaFilename] = useState("");
  const [qaBusy, setQaBusy] = useState(false);

  // STEP 2
  const [paperFiles, setPaperFiles] = useState([]);
  const [task, setTask] = useState("");
  const [paperResults, setPaperResults] = useState([]); // [{ file, filename, data }]
  const [paperBusy, setPaperBusy] = useState(false);

  // STEP 3 (agents & eval)
  const [agentsFile, setAgentsFile] = useState("");
  const [agents, setAgents] = useState([]);
  const [evalFile, setEvalFile] = useState("");
  const [evaluations, setEvaluations] = useState([]);

  // STEP 3 (personas)
  const [personasResults, setPersonasResults] = useState([]); // [{file, filename, data: { [stakeholder]: [persona,...] }}]
  const [personasBusy, setPersonasBusy] = useState(false);

  // STEP 4 (phase results)
  const [phase1, setPhase1] = useState(null);
  const [phase1Busy, setPhase1Busy] = useState(false);
  const [phase2, setPhase2] = useState(null);
  const [phase2Busy, setPhase2Busy] = useState(false);
  const [phase3, setPhase3] = useState(null);
  const [phase3Busy, setPhase3Busy] = useState(false);

  /* ---------- STEP 1 handlers ---------- */
  async function generateQA() {
    if (!qaFiles.length) return alert("Please select PDFs first.");
    setQaBusy(true);
    try {
      const fd = new FormData();
      qaFiles.forEach((f) => fd.append("files", f));
      const { data } = await axios.post("/api/qa/generate", fd);
      setQaPairs(data.data.pairs || []);
      setQaFilename(data.filename);
      setStep(1);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setQaBusy(false);
    }
  }

  async function handleNextFromStep1() {
    if (!qaPairs.length) return alert("Generate Q&A first.");
    try {
      const { data } = await axios.post("/api/qa/save", {
        filename: qaFilename || undefined,
        data: { pairs: qaPairs },
      });
      setQaFilename(data.savedAs);
      setStep1Completed(true);
      setStep(2);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  async function saveQA() {
    try {
      const filename = prompt(
        "Save as (optional, keep empty to auto-name):",
        qaFilename || ""
      );
      const { data } = await axios.post("/api/qa/save", {
        filename: filename || undefined,
        data: { pairs: qaPairs },
      });
      setQaFilename(data.savedAs);
      alert("Saved: " + data.savedAs);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  /* ---------- STEP 2 handlers ---------- */
  async function generatePapers() {
    if (!paperFiles.length) return alert("Please select PDFs first.");
    setPaperBusy(true);
    try {
      const fd = new FormData();
      paperFiles.forEach((f) => fd.append("files", f));
      fd.append("taskDescription", task);
      const { data } = await axios.post("/api/papers/generate", fd);
      setPaperResults(data.results || []);
      setStep(2);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setPaperBusy(false);
    }
  }

  async function generateStakeholders() {
    if (!paperFiles.length) return alert("Please select PDFs first.");
    setPaperBusy(true);
    try {
      const fd = new FormData();
      paperFiles.forEach((f) => fd.append("files", f));
      fd.append("taskDescription", task);
      const { data } = await axios.post("/api/papers/stakeholders", fd);
      setPaperResults(data.results || []);
      setStep(2);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setPaperBusy(false);
    }
  }

  async function savePaper(idx) {
    try {
      const r = paperResults[idx];
      const payload = { filename: r.filename, data: r.data };
      const { data } = await axios.post("/api/papers/save", payload);
      alert("Saved: " + data.savedAs);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  async function saveStakeholders(idx) {
    try {
      const r = paperResults[idx];
      const payload = { filename: r.filename, data: r.data };
      const { data } = await axios.post("/api/papers/save", payload);
      alert("Saved: " + data.savedAs);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  async function handleNextFromStep2() {
    if (!paperResults.length) {
      alert("Analyze at least one paper first.");
      return;
    }
    setStep2Completed(true);
    setStep(3);
  }

  /* ---------- STEP 3 handlers ---------- */
  async function buildAgents() {
    if (!paperResults.length && !personasResults.length) {
      alert("No papers/personas to build agents from.");
      return;
    }
    try {
      const base = personasResults.length ? personasResults : paperResults;
      const { data } = await axios.post("/api/agents/build", { papers: base });
      setAgents(data.agents || []);
      setAgentsFile(data.filename || "");
      alert(`Agents file created: ${data.filename}`);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  async function runInitialEvaluation() {
    if (!agents.length) return alert("Build agents first.");
    if (!qaPairs.length) return alert("You must complete Step 1 (Q&A) first.");
    try {
      const { data } = await axios.post("/api/agents/evaluate", {
        agents,
        qaPairs,
      });
      setEvaluations(data.evaluations || []);
      setEvalFile(data.filename || "");
      alert(`Evaluation saved: ${data.filename}`);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  async function generatePersonas() {
    const tuplePapers = paperResults.filter((r) => Array.isArray(r?.data));
    if (!tuplePapers.length) {
      alert("Run 'Extract Stakeholders (tuples)' in Step 2 first.");
      return;
    }
    setPersonasBusy(true);
    try {
      const { data } = await axios.post("/api/personas/generate", {
        papers: tuplePapers,
        taskDescription: task,
      });
      setPersonasResults(data.results || []);
      if (step < 3) setStep(3);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setPersonasBusy(false);
    }
  }

  async function savePersonas(idx) {
    try {
      const r = personasResults[idx];
      const payload = { filename: r.filename, data: r.data };
      const { data } = await axios.post("/api/personas/save", payload);
      //const { data } = await axios.post("/api/papers/save", payload);
      alert("Saved: " + data.savedAs);
      // Unlock Step 4 on successful save
      setStep4Unlocked(true);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  function onUnlockStep4() {
    // Optional explicit unlock on “Finalize & Save” button in Step 3
    setStep4Unlocked(true);
    setStep(4);
  }

  async function onRunPhase1() {
    if (!agents.length) return alert("Build agents first (Step 3).");
    if (!qaPairs.length) return alert("You must complete Step 1 (Q&A).");
    setPhase1Busy(true);
    try {
      const { data } = await axios.post("/api/debate/phase1", {
        agents,
        qaPairs,
      });
      setPhase1(data);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setPhase1Busy(false);
    }
  }

  async function onRunPhase2() {
    if (!agents.length) return alert("Build agents first.");
    if (!qaPairs.length) return alert("You must complete Step 1 (Q&A).");
    if (!phase1?.initialEvaluations?.length) return alert("Run Phase 1 first.");
    setPhase2Busy(true);
    try {
      const { data } = await axios.post("/api/debate/phase2", {
        agents,
        qaPairs,
        phase1,
        maxRounds: 12,
      });
      setPhase2(data);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setPhase2Busy(false);
    }
  }

  async function onRunPhase3() {
    if (!phase2?.finalEvaluations?.length) return alert("Run Phase 2 first.");
    setPhase3Busy(true);
    try {
      const { data } = await axios.post("/api/debate/phase3", {
        qaPairs,
        phase2,
      });
      setPhase3(data);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setPhase3Busy(false);
    }
  }

  return (
    <div className="container">
      <h1>PDF → Q&A + Paper Analyzer + Agents</h1>
      <p className="muted">
        Complete each step and press <em>Next</em> to proceed.
      </p>

      <Stepper
        step={step}
        setStep={setStep}
        step1Completed={step1Completed}
        step2Completed={step2Completed}
        step4Unlocked={step4Unlocked}
      />

      {step === 1 && (
        <Step1
          qaFiles={qaFiles}
          setQaFiles={setQaFiles}
          qaPairs={qaPairs}
          setQaPairs={setQaPairs}
          qaFilename={qaFilename}
          qaBusy={qaBusy}
          generateQA={generateQA}
          saveQA={saveQA}
          handleNextFromStep1={handleNextFromStep1}
        />
      )}

      {step === 2 && (
        <Step2
          paperFiles={paperFiles}
          setPaperFiles={setPaperFiles}
          task={task}
          setTask={setTask}
          paperResults={paperResults}
          setPaperResults={setPaperResults}
          paperBusy={paperBusy}
          generatePapers={generatePapers}
          generateStakeholders={generateStakeholders}
          savePaper={savePaper}
          saveStakeholders={saveStakeholders}
          handleNextFromStep2={handleNextFromStep2}
        />
      )}

      {step === 3 && (
        <Step3
          task={task}
          paperResults={paperResults}
          personasResults={personasResults}
          setPersonasResults={setPersonasResults}
          personasBusy={personasBusy}
          agentsFile={agentsFile}
          agents={agents}
          evalFile={evalFile}
          evaluations={evaluations}
          generatePersonas={generatePersonas}
          savePersonas={savePersonas}
          buildAgents={buildAgents}
          runInitialEvaluation={runInitialEvaluation}
          onUnlockStep4={onUnlockStep4}
        />
      )}

      {step === 4 && (
  <Step4
    // qaFilename={qaFilename}
    // qaPairs={qaPairs}
    // paperResults={paperResults}
    // personasResults={personasResults}
    // agentsFile={agentsFile}
    // agents={agents}
    // setAgents={setAgents}
    // setAgentsFile={setAgentsFile}
    // task={task}

    // evalFile={evalFile}
    // evaluations={evaluations}
    // phase1={phase1}
    // phase1Busy={phase1Busy}
    // onRunPhase1={onRunPhase1}
    // phase2={phase2}
    // phase2Busy={phase2Busy}
    // onRunPhase2={onRunPhase2}
    // phase3={phase3}
    // phase3Busy={phase3Busy}
    // onRunPhase3={onRunPhase3}
    qaFilename={qaFilename}
    qaPairs={qaPairs}
    paperResults={paperResults}
    personasResults={personasResults}
    agentsFile={agentsFile}
    agents={agents}
    setAgents={setAgents}
    setAgentsFile={setAgentsFile}
    task={task}
  />
)}

    </div>
  );
}
