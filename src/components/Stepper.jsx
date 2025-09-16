import React from "react";

export default function Stepper({
  step, setStep,
  step1Completed,
  step2Completed,
  step4Unlocked
}) {
  return (
    <div className="stepper">
      <button
        className={"step " + (step === 1 ? "active" : "")}
        onClick={() => setStep(1)}
      >
        Step 1: SourceText → Q&A
      </button>

      <button
        className={"step " + (step === 2 ? "active" : "")}
        disabled={!step1Completed}
        onClick={() => step1Completed && setStep(2)}
        title={!step1Completed ? "Finish Step 1 and click Next" : ""}
      >
        Step 2: Papers → Analysis
      </button>

      <button
        className={"step " + (step === 3 ? "active" : "")}
        disabled={!step2Completed}
        onClick={() => step2Completed && setStep(3)}
        title={!step2Completed ? "Finish Step 2 and click Next" : ""}
      >
        Step 3: Personas & Multi-agent Debate
      </button>

      <button
        className={"step " + (step === 4 ? "active" : "")}
        disabled={!step4Unlocked}
        onClick={() => step4Unlocked && setStep(4)}
        title={!step4Unlocked ? "Click Finalize & Save in Step 3 to unlock" : ""}
      >
        Step 4: Review & Export
      </button>
    </div>
  );
}
