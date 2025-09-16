// server/index.js
import "dotenv/config";                 // .env: OPENAI_API_KEY / MOCK_OPENAI / PORT
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import {Readable} from "stream";

import { pdfBufferToText, chunkText } from "./pdf.js";

// ---------- ESM path setup ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- App setup ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

// In-memory uploads with limits (adjust as needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 } // 25MB/file, up to 10 files
});

// ---------- Directories ----------
const DATA_DIR = path.join(__dirname, "data");
const PAPERS_DIR = path.join(DATA_DIR, "papers");
const EVALS_DIR = path.join(DATA_DIR, "evaluations");
const PROMPTS_DIR = path.join(__dirname, "prompts");

await fs.ensureDir(DATA_DIR);
await fs.ensureDir(PAPERS_DIR);
await fs.ensureDir(EVALS_DIR);
await fs.ensureDir(PROMPTS_DIR);

// ---------- Utilities ----------
function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function readPrompt(name) {
  return fs.readFile(path.join(PROMPTS_DIR, name), "utf-8");
}

// ---------- OpenAI wiring ----------
let createStructuredJSON = null;
const USE_MOCK = process.env.MOCK_OPENAI === "1" || !process.env.OPENAI_API_KEY;
if (!USE_MOCK) {
  const mod = await import("./openaiClient.js");
  createStructuredJSON = mod.createStructuredJSON;
}

// ---------- Health ----------
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    mode: USE_MOCK ? "MOCK" : "REAL",
    time: new Date().toISOString()
  });
});

// ======================================================================
// STEP 1: SourceText PDFs → Q&A pairs
// ======================================================================
app.post("/api/qa/generate", upload.array("files"), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: "No PDF files uploaded." });
    }

    if (USE_MOCK) {
      const dummyPairs = [
        { question: "What is React?", answer: "A JavaScript library for building UIs." },
        { question: "What is Node.js?", answer: "A runtime for executing JavaScript outside the browser." }
      ];
      const filename = `qa-dummy-${nowStamp()}.json`;
      await fs.writeJson(path.join(DATA_DIR, filename), { pairs: dummyPairs }, { spaces: 2 });
      return res.json({ filename, data: { pairs: dummyPairs } });
    }

    if (!createStructuredJSON) {
      return res.status(500).json({ error: "OpenAI client not initialized" });
    }

    let qaPrompt;
    try {
      qaPrompt = await readPrompt("qaPrompt.txt"); // ensure server/prompts/qaPrompt.txt exists
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Missing prompt: server/prompts/qaPrompt.txt" });
    }

    // Extract text from all PDFs → chunk
    let combined = "";
    for (const f of files) {
      const text = await pdfBufferToText(f.buffer);
      if (text) combined += `\n\n${text}`;
    }
    if (!combined.trim()) {
      return res.status(400).json({ error: "Uploaded PDFs contained no extractable text." });
    }

    const chunks = chunkText(combined, 12000);

    // Output schema for Q&A pairs
    const qaSchema = {
      type: "object",
      properties: {
        pairs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" }
            },
            required: ["question", "answer"],
            additionalProperties: false
          }
        }
      },
      required: ["pairs"],
      additionalProperties: false
    };

    const allPairs = [];
    for (let i = 0; i < chunks.length; i++) {
      const input = [
        { role: "user", content: qaPrompt },
        { role: "user", content: `SOURCE CHUNK ${i + 1}/${chunks.length}:\n${chunks[i]}` }
      ];

      const out = await createStructuredJSON({
        instructions: "Create accurate Q&A pairs grounded strictly in the provided text. Do not hallucinate.",
        input,
        schema: qaSchema
      });

      if (out?.pairs?.length) allPairs.push(...out.pairs);
    }

    const filename = `qa-${nowStamp()}.json`;
    await fs.writeJson(path.join(DATA_DIR, filename), { pairs: allPairs }, { spaces: 2 });
    return res.json({ filename, data: { pairs: allPairs } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to generate Q&A." });
  }
});

app.post("/api/qa/save", async (req, res) => {
  try {
    const { filename, data } = req.body;
    const fname = filename || `qa-edited-${nowStamp()}.json`;
    await fs.writeJson(path.join(DATA_DIR, fname), data, { spaces: 2 });
    res.json({ savedAs: fname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================================================
// STEP 2A: Research papers → Stakeholder Tuples (Section 3.1)
// ======================================================================
app.post("/api/papers/stakeholders", upload.array("files"), async (req, res) => {
  try {
    const files = req.files || [];
    const taskDescription = req.body.taskDescription || "";
    if (files.length === 0) return res.status(400).json({ error: "No PDF files uploaded." });

    if (USE_MOCK) {
      const mock = files.map((f) => ({
        file: f.originalname,
        filename: `${path.parse(f.originalname).name}-stakeholders-${nowStamp()}.json`,
        data: [
          {
            name: "Parents",
            description: "Caregivers evaluating child-focused QA usefulness.",
            pairs: [
              { dimension: "Questions stimulate creativity/critical thinking", evidence: "Participants felt current tools were 'silly'..." }
            ]
          }
        ]
      }));
      for (const m of mock) {
        await fs.writeJson(path.join(PAPERS_DIR, m.filename), m.data, { spaces: 2 });
      }
      return res.json({ results: mock });
    }

    if (!createStructuredJSON) {
      return res.status(500).json({ error: "OpenAI client not initialized" });
    }

    let identifyPromptTmpl;
    try {
      identifyPromptTmpl = await readPrompt("stakeholderIdentify.txt"); // server/prompts/stakeholderIdentify.txt
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Missing prompt: server/prompts/stakeholderIdentify.txt" });
    }

    // Per-chunk schema: { [stakeholderName]: { characteristics, perspectives: [{perspective, evidence}] } }
    const chunkSchema = {
      type: "object",
      // strict mode requires both of these even if empty
      properties: {},
      required: [],
      additionalProperties: {
        type: "object",
        properties: {
          characteristics: { type: "string" },
          perspectives: {
            type: "array",
            items: {
              type: "object",
              properties: {
                perspective: { type: "string" },
                evidence: { type: "string" }
              },
              required: ["perspective", "evidence"],
              additionalProperties: false
            }
          }
        },
        required: ["characteristics", "perspectives"],
        additionalProperties: false
      }
    };



    const results = [];
    for (const f of files) {
      const baseName = path.parse(f.originalname).name;

      const text = await pdfBufferToText(f.buffer);
      if (!text?.trim()) continue;

      const chunks = chunkText(text, 12000);

      // Collect per-chunk stakeholder dicts
      const perChunk = [];
      for (let i = 0; i < chunks.length; i++) {
        const prompt = identifyPromptTmpl.replace("{TASK_DESCRIPTION}", taskDescription || "(no task provided)");
        const input = [
          { role: "user", content: prompt },
          { role: "user", content: `PAPER CHUNK ${i + 1}/${chunks.length}:\n${chunks[i]}` }
        ];

        const out = await createStructuredJSON({
          instructions: "Identify stakeholders, their characteristics, and perspective–evidence pairs grounded strictly in the provided chunk.",
          input,
          schema: chunkSchema
        });

        if (out && typeof out === "object") perChunk.push(out);
      }

      // Merge chunk dicts → Map(name -> { description, pairs[] })
      const mergedMap = new Map();
      for (const dict of perChunk) {
        for (const [name, val] of Object.entries(dict)) {
          const desc = (val.characteristics || "").trim();
          const pairs = (val.perspectives || [])
            .map((p) => ({
              dimension: (p.perspective || "").trim(),
              evidence: (p.evidence || "").trim()
            }))
            .filter((p) => p.dimension && p.evidence);

          if (!mergedMap.has(name)) mergedMap.set(name, { description: "", pairs: [] });
          const entry = mergedMap.get(name);

          if (desc && (!entry.description || desc.length > entry.description.length)) {
            entry.description = desc;
          }

          const seen = new Set(entry.pairs.map((pe) => pe.dimension + "||" + pe.evidence));
          for (const pe of pairs) {
            const key = pe.dimension + "||" + pe.evidence;
            if (!seen.has(key)) {
              entry.pairs.push(pe);
              seen.add(key);
            }
          }
        }
      }

      const tuples = Array.from(mergedMap.entries()).map(([name, v]) => ({
        name,
        description: v.description || "",
        pairs: v.pairs
      }));

      const outName = `${baseName}-stakeholders-${nowStamp()}.json`;
      await fs.writeJson(path.join(PAPERS_DIR, outName), tuples, { spaces: 2 });
      results.push({ file: f.originalname, filename: outName, data: tuples });
    }

    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to extract stakeholder tuples." });
  }
});

// Save edited tuples (Step 2A UI's "Save JSON")
app.post("/api/papers/save", async (req, res) => {
  try {
    const { filename, data } = req.body;
    if (!filename) return res.status(400).json({ error: "filename is required" });
    await fs.writeJson(path.join(PAPERS_DIR, filename), data, { spaces: 2 });
    res.json({ savedAs: filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================================================
// STEP 2A (utility): Combine / deduplicate similar stakeholders
// ======================================================================
app.post("/api/papers/stakeholders/combine", async (req, res) => {
  try {
    const list = req.body?.list;
    if (!Array.isArray(list)) {
      return res.status(400).json({ error: "Body must include { list: StakeholderTuple[] }" });
    }

    // MOCK path (optional): simple name-based squash
    if (USE_MOCK) {
      const byName = new Map();
      for (const st of list) {
        const key = (st?.name || "").trim().toLowerCase();
        if (!key) continue;
        if (!byName.has(key)) {
          byName.set(key, {
            name: st.name || "",
            description: st.description || "",
            pairs: Array.isArray(st.pairs) ? [...st.pairs] : []
          });
        } else {
          const tgt = byName.get(key);
          // prefer longer description
          if ((st.description || "").length > (tgt.description || "").length) {
            tgt.description = st.description || "";
          }
          const seen = new Set(tgt.pairs.map(p => `${p.dimension}||${p.evidence}`));
          for (const p of st.pairs || []) {
            const k = `${p.dimension}||${p.evidence}`;
            if (!seen.has(k)) {
              tgt.pairs.push({ dimension: p.dimension || "", evidence: p.evidence || "" });
              seen.add(k);
            }
          }
        }
      }
      return res.json({ merged: Array.from(byName.values()) });
    }

    if (!createStructuredJSON) {
      return res.status(500).json({ error: "OpenAI client not initialized" });
    }

    // Load prompt from file (put this file in server/prompts)
    // Example content idea (you can refine): instructions on clustering by semantic similarity,
    // keeping longest description, and deduplicating pairs.
    const combinePrompt = await readPrompt("stakeholderCombine.txt");

    // Strict response schema expected from the model
    const mergeSchema = {
      type: "object",
      properties: {
        merged: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              pairs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    dimension: { type: "string" },
                    evidence: { type: "string" }
                  },
                  required: ["dimension", "evidence"],
                  additionalProperties: false
                }
              }
            },
            required: ["name", "description", "pairs"],
            additionalProperties: false
          }
        }
      },
      required: ["merged"],
      additionalProperties: false
    };

    // Build input: instructions + current list
    const input = [
      { role: "user", content: combinePrompt },
      { role: "user", content: "CURRENT STAKEHOLDER LIST (JSON):" },
      { role: "user", content: JSON.stringify(list, null, 2) }
    ];

    const out = await createStructuredJSON({
      instructions: "Combine/cluster near-duplicate stakeholders and deduplicate dimension-evidence pairs. Return only the JSON specified by the schema.",
      input,
      schema: mergeSchema,
      // use a small amount of randomness if you prefer
      temperature: 0.1
    });

    // Basic shape guard
    const merged = Array.isArray(out?.merged) ? out.merged : [];
    return res.json({ merged });
  } catch (err) {
    // Helpful logging
    console.error("[OpenAI] createStructuredJSON error:");
    if (err?.status || err?.code || err?.param || err?.message) {
      console.error(" status:", err.status);
      console.error(" code:", err.code);
      console.error(" param:", err.param);
      console.error(" message:", err.message);
    } else {
      console.error(err);
    }
    res.status(500).json({ error: err.message || "Failed to combine stakeholders." });
  }
});




// ======================================================================
// STEP 2B: Personas from stakeholder tuples
// ======================================================================
app.post("/api/personas/generate", async (req, res) => {
  try {
    const { papers, taskDescription = "" } = req.body || {};
    if (!Array.isArray(papers) || papers.length === 0) {
      return res.status(400).json({ error: "Provide papers (array) with stakeholder tuples in data." });
    }

    if (USE_MOCK) {
      const results = papers.map((p, i) => {
        const baseName = path.parse(p.file || `paper_${i + 1}.pdf`).name || `Paper_${i + 1}`;
        const outName = `${baseName}-personas-${nowStamp()}.json`;
        const fake = {};
        (p.data || []).forEach((st) => {
          fake[st.name || "Unknown"] = [
            {
              personaName: "Avery Kim",
              demographicInformation: "Age 34, M.Ed., public school teacher, patient, curious.",
              perspective: "Values questions that scaffold children’s inference and tie to real-world knowledge.",
              specialty: "Early childhood literacy facilitation.",
              psychologicalTraits: "High conscientiousness, high empathy; prefers structured guidance.",
              socialRelationships: "Collaborates with parents and librarians; mentors junior teachers."
            }
          ];
        });
        fs.writeJson(path.join(PAPERS_DIR, outName), fake, { spaces: 2 });
        return { file: p.file, filename: outName, data: fake };
      });
      return res.json({ results });
    }

    if (!createStructuredJSON) {
      return res.status(500).json({ error: "OpenAI client not initialized" });
    }

    let personaPromptTmpl;
    try {
      personaPromptTmpl = await readPrompt("stakeholderPersona.txt"); // server/prompts/stakeholderPersona.txt
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Missing prompt: server/prompts/stakeholderPersona.txt" });
    }

    // Schema: { [stakeholderName]: [ personaObj, ... ] }
    const personaSchema = {
      type: "object",
      properties: {},   // 👈 required in strict mode
      required: [],     // 👈 required in strict mode
      additionalProperties: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        items: {
          type: "object",
          properties: {
            personaName: { type: "string" },
            demographicInformation: { type: "string" },
            perspective: { type: "string" },
            specialty: { type: "string" },
            psychologicalTraits: { type: "string" },
            socialRelationships: { type: "string" }
          },
          required: [
            "personaName",
            "demographicInformation",
            "perspective",
            "specialty",
            "psychologicalTraits",
            "socialRelationships"
          ],
          additionalProperties: false
        }
      }
    };

    const results = [];
    for (let i = 0; i < papers.length; i++) {
      const p = papers[i];
      const baseName = path.parse(p.file || `paper_${i + 1}.pdf`).name || `Paper_${i + 1}`;

      // Compact stakeholder-perspective doc
      const stakeDoc = (p.data || []).map((st) => ({
        name: st.name || "",
        description: st.description || "",
        perspectives: (st.pairs || []).map((pe) => ({
          perspective: pe.dimension || "",
          evidence: pe.evidence || ""
        }))
      }));

      const prompt = [
        personaPromptTmpl.replace("{TASK_DESCRIPTION}", taskDescription || "(no task provided)"),
        "",
        "### STAKEHOLDER PERSPECTIVES (from Step 2A)",
        JSON.stringify(stakeDoc, null, 2)
      ].join("\n");

      const input = [{ role: "user", content: prompt }];

      const personaOut = await createStructuredJSON({
        instructions: "Create personas per stakeholder perspective. Return a JSON object keyed by stakeholder name to an array of persona objects.",
        input,
        schema: personaSchema
      });

      // ✅ Normalize: ensure exactly ONE persona per stakeholder
      if (personaOut && typeof personaOut === "object") {
        for (const k of Object.keys(personaOut)) {
          const arr = Array.isArray(personaOut[k]) ? personaOut[k] : [];
          personaOut[k] = arr.slice(0, 1);   // keep only the first
        }
      }


      const outName = `${baseName}-personas-${nowStamp()}.json`;
      await fs.writeJson(path.join(PAPERS_DIR, outName), personaOut, { spaces: 2 });

      results.push({ file: p.file, filename: outName, data: personaOut });
    }

    return res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to generate personas." });
  }
});

// ======================================================================
// STEP 3: Build agents from stakeholder tuples (stakeholder-first version)
// ======================================================================
app.post("/api/agents/build", async (req, res) => {
  try {
    const { papers } = req.body;
    if (!Array.isArray(papers) || papers.length === 0) {
      return res.status(400).json({ error: "No paper results provided." });
    }

    const agents = papers.map((p, i) => {
      const nameBase = path.parse(p.file || `paper_${i + 1}.pdf`).name || `Paper_${i + 1}`;
      const agentId = `agent_${i + 1}`;
      const stakeCount = Array.isArray(p.data) ? p.data.length : 0;
      const sampleNames = (Array.isArray(p.data) ? p.data.slice(0, 5) : [])
        .map(s => s?.name)
        .filter(Boolean);

      const personaPrompt = [
        `AGENT NAME: ${nameBase}`,
        `SOURCE FILE: ${p.file || "(unknown)"}`,
        `STAKEHOLDER COUNT: ${stakeCount}`,
        sampleNames.length ? `STAKEHOLDERS (sample): ${sampleNames.join(", ")}` : "",
        "",
        "INSTRUCTIONS:",
        "- You are the persona constructed from this paper's stakeholder perspectives.",
        "- When evaluating Q&A pairs, judge only using the paper’s evidence (dimension–evidence tuples).",
        "- Be concise and avoid claims not grounded in the tuples."
      ].join("\n");

      return {
        agentId,
        name: nameBase,
        sourceFilename: p.filename,
        personaPrompt
      };
    });

    const agentsFilename = `agents-${nowStamp()}.json`;
    await fs.writeJson(path.join(PROMPTS_DIR, agentsFilename), { agents }, { spaces: 2 });

    res.json({ filename: agentsFilename, agents });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to build agents." });
  }
});

// ======================================================================
// STEP 3: Agents evaluate Q&A (Likert 1–5) — deterministic stand-in
// ======================================================================
app.post("/api/agents/evaluate", async (req, res) => {
  try {
    const { agents, qaPairs } = req.body;
    if (!Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({ error: "No agents provided." });
    }
    if (!Array.isArray(qaPairs) || qaPairs.length === 0) {
      return res.status(400).json({ error: "No Q&A pairs provided." });
    }

    function pseudoScore(agentId, question) {
      const s = (agentId + "|" + (question || "")).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      return (s % 5) + 1; // 1..5
    }
    function labelFor(score) {
      switch (score) {
        case 1: return "Strongly Disagree";
        case 2: return "Disagree";
        case 3: return "Neither Agree nor Disagree";
        case 4: return "Agree";
        case 5: return "Strongly Agree";
        default: return "N/A";
      }
    }

    const evaluations = agents.map((agent) => {
      const ratings = qaPairs.map((qa, idx) => {
        const score = pseudoScore(agent.agentId, qa.question);
        const label = labelFor(score);
        const rationale = `Based on ${agent.name}, this statement ${score >= 4 ? "aligns" : score <= 2 ? "conflicts" : "is partially supported"
          } with the paper's evidence.`;
        return { index: idx, question: qa.question, score, label, rationale };
      });

      const avg = ratings.reduce((a, r) => a + r.score, 0) / ratings.length;
      return {
        agentId: agent.agentId,
        name: agent.name,
        sourceFilename: agent.sourceFilename,
        ratings,
        average: Number(avg.toFixed(2))
      };
    });

    const outName = `eval-${nowStamp()}.json`;
    await fs.writeJson(path.join(EVALS_DIR, outName), { evaluations }, { spaces: 2 });
    res.json({ filename: outName, evaluations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to evaluate Q&A." });
  }
});

// ======================================================================
// STEP 4 — Three-Phase Debate (Phase 1 → Phase 2 → Phase 3)
// Uses prompt templates in server/prompts/* and strict JSON schemas
// ======================================================================

// Small helper to start an NDJSON stream response
function startNdjson(res) {
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
}

// Write one JSON object per line
function writeLine(res, obj) {
  res.write(JSON.stringify(obj) + "\n");
}

/**
 * Phase 1 — Independent evaluations (Table 15-like)
 * Body: { agents: [{agentId,name,personaPrompt}], qaPairs: [{question,answer}, ...] }
 * Returns: { initialEvaluations: [{ agentId, score, rationale }] }
 */
app.post("/api/debate/phase1", async (req, res) => {
  try {
    startNdjson(res);
    const { agents = [], qaPairs = [] } = req.body || {};

    console.log(">>> [Run Phase 1 button clicked]");
    console.log("    Agents length:", agents.length);
    console.log("    Disabled on client?", (!agents.length || !qaPairs.length));

    writeLine(res, { type: "info", message: "Phase 1 started." });
    if (!qaPairs.length || !agents.length) {
      writeLine(res, { type: "error", message: "Missing qaPairs or agents." });
      return res.end();
    }

    if (USE_MOCK) {
      writeLine(res, { type: "info", message: "Using MOCK for Phase 1." });
      const initialEvaluations = agents.map((a, i) => ({
        agentId: a.agentId,
        score: ((i % 5) + 1),
        rationale: "Mock rationale (demo only)."
      }));
      writeLine(res, { initialEvaluations });
      writeLine(res, { type: "success", message: "Phase 1 complete." });
      return res.end();
    }

    if (!createStructuredJSON) {
      writeLine(res, { type: "error", message: "OpenAI client not initialized." });
      return res.end();
    }

    const tmpl = await readPrompt("phase1Independent.txt");

    const evalSchema = {
      type: "object",
      properties: {
        score: { type: "integer", minimum: 1, maximum: 5 },
        rationale: { type: "string" }
      },
      required: ["score", "rationale"],
      additionalProperties: false
    };

    const qaBlob = JSON.stringify({ qaPairs }, null, 2);
    const results = [];

    for (const a of agents) {
      writeLine(res, { type: "info", message: `Scoring as ${a.name || a.agentId}…` });

      const prompt = [
        a.personaPrompt || "",
        "",
        tmpl
          .replace("{QA_PAIRS}", qaBlob)
          .replace("{LIKERT_SCALE}",
            "1 – Strongly Disagree; 2 – Disagree; 3 – Neither Agree nor Disagree; 4 – Agree; 5 – Strongly Agree")
      ].join("\n");

      const out = await createStructuredJSON({
        instructions: "Return strictly valid JSON for the evaluation.",
        input: [{ role: "user", content: prompt }],
        schema: evalSchema,
        model: "gpt-4.1-mini",
        temperature: 0.2
      });

      results.push({
        agentId: a.agentId,
        score: Number(out?.score ?? 3),
        rationale: String(out?.rationale ?? "")
      });

      // Stream partial as we go (optional)
      writeLine(res, { partial: { agentId: a.agentId, score: results.at(-1).score } });
    }

    writeLine(res, { initialEvaluations: results });
    writeLine(res, { type: "success", message: "Phase 1 complete." });
    res.end();
  } catch (err) {
    writeLine(res, { type: "error", message: err.message || "Phase 1 failed." });
    res.end();
  }
});



/**
 * Phase 2 — Coordinated multi-turn debate (Table 16-like)
 * Body: {
 *   agents: [{agentId,name,personaPrompt}],
 *   qaPairs: [{question,answer}],
 *   phase1: { initialEvaluations: [{agentId,score,rationale}] },
 *   maxRounds?: number (default 12)
 * }
 * Returns: { transcript: [{round,speaker,text}], finalEvaluations: [{agentId,score,rationale}] }
 */
app.post("/api/debate/phase2", async (req, res) => {
  try {
    startNdjson(res);
    const { agents = [], qaPairs = [], phase1 = {}, maxRounds = 12 } = req.body || {};

    writeLine(res, { type: "info", message: "Phase 2 started (debate coordinator active)." });
    if (!agents.length || !qaPairs.length || !phase1?.initialEvaluations?.length) {
      writeLine(res, { type: "error", message: "Missing qaPairs, agents, or Phase 1 results." });
      return res.end();
    }

    if (USE_MOCK) {
      writeLine(res, { type: "info", message: "Using MOCK for Phase 2." });
      const transcript = [{ round: 1, speaker: "coordinator", text: "Mock debate skipped." }];
      writeLine(res, { transcript });
      writeLine(res, { finalEvaluations: (phase1?.initialEvaluations || []) });
      writeLine(res, { type: "success", message: "Phase 2 complete." });
      return res.end();
    }

    if (!createStructuredJSON) {
      writeLine(res, { type: "error", message: "OpenAI client not initialized." });
      return res.end();
    }

    const coordinatorTmpl = await readPrompt("phase2Coordinator.txt");
    const speakerTmpl = await readPrompt("phase2Speaker.txt");

    const coordinatorSchema = {
      type: "object",
      properties: {
        stop: { type: "boolean" },
        nextAgentId: { type: "string" },
        reason: { type: "string" }
      },
      required: ["stop"],
      additionalProperties: false
    };

    const speakerSchema = {
      type: "object",
      properties: {
        comment: { type: "string" },
        final: { type: "boolean" },
        updatedScore: { type: "integer", minimum: 1, maximum: 5 },
        updatedRationale: { type: "string" }
      },
      required: ["comment", "final"],
      additionalProperties: false
    };

    const transcript = [];
    const finalFlags = new Map(agents.map(a => [a.agentId, false]));
    const finals = new Map();
    const roster = agents.map(a => ({ agentId: a.agentId, name: a.name || a.agentId }));
    const initialMap = new Map((phase1?.initialEvaluations || []).map(e => [e.agentId, e]));
    const qaBlob = JSON.stringify(qaPairs, null, 2);

    const everyoneDone = () => agents.every(a => finalFlags.get(a.agentId));

    for (let round = 1; round <= Math.max(1, Number(maxRounds)); round++) {
      if (everyoneDone()) break;

      const coordPrompt = coordinatorTmpl
        .replace("{ROSTER}", JSON.stringify(roster, null, 2))
        .replace("{PHASE1_EVALS}", JSON.stringify(phase1?.initialEvaluations || [], null, 2))
        .replace("{TRANSCRIPT}", JSON.stringify(transcript, null, 2))
        .replace("{FINAL_FLAGS}", JSON.stringify(Object.fromEntries(finalFlags), null, 2));

      const choose = await createStructuredJSON({
        instructions: "Return strictly valid JSON as coordinator.",
        input: [{ role: "user", content: coordPrompt }],
        schema: coordinatorSchema,
        model: "gpt-4.1-mini",
        temperature: 0.0
      });

      if (choose?.stop || everyoneDone()) break;

      const nextId = String(choose?.nextAgentId || "");
      const chosen = agents.find(a => a.agentId === nextId && !finalFlags.get(nextId));
      const picked = chosen || agents.find(a => !finalFlags.get(a.agentId));
      if (!picked) break;

      const line = `Round ${round}: coordinator picks ${picked.agentId}${choose?.reason ? ` — ${choose.reason}` : ""}`;
      transcript.push({ round, speaker: "coordinator", text: line });
      writeLine(res, { transcript }); // incremental

      const p1 = initialMap.get(picked.agentId) || null;
      const spPrompt = [
        picked.personaPrompt || "",
        "",
        speakerTmpl
          .replace("{QA_PAIRS}", qaBlob)
          .replace("{PHASE1_EVAL}", JSON.stringify(p1 || {}, null, 2))
          .replace("{TRANSCRIPT}", JSON.stringify(transcript, null, 2))
          .replace("{LIKERT_SCALE}",
            "1 – Strongly Disagree; 2 – Disagree; 3 – Neither Agree nor Disagree; 4 – Agree; 5 – Strongly Agree")
      ].join("\n");

      const resp = await createStructuredJSON({
        instructions: "Return strictly valid JSON for your debate turn.",
        input: [{ role: "user", content: spPrompt }],
        schema: speakerSchema,
        model: "gpt-4.1-mini",
        temperature: 0.3
      });

      const text = String(resp?.comment || "");
      transcript.push({ round, speaker: picked.agentId, text });
      writeLine(res, { transcript }); // incremental

      if (resp?.final) {
        finalFlags.set(picked.agentId, true);
        const sc = Number(resp?.updatedScore ?? (p1?.score ?? 3));
        const ra = String(resp?.updatedRationale ?? p1?.rationale ?? "");
        finals.set(picked.agentId, { score: sc, rationale: ra });
      }
    }

    for (const a of agents) {
      if (!finals.has(a.agentId)) {
        const p1 = initialMap.get(a.agentId);
        finals.set(a.agentId, {
          score: Number(p1?.score ?? 3),
          rationale: String(p1?.rationale ?? "")
        });
      }
    }

    writeLine(res, {
      finalEvaluations: Array.from(finals.entries()).map(([agentId, v]) => ({ agentId, ...v }))
    });
    writeLine(res, { type: "success", message: "Phase 2 complete." });
    res.end();
  } catch (err) {
    writeLine(res, { type: "error", message: err.message || "Phase 2 failed." });
    res.end();
  }
});


/**
 * Phase 3 — Aggregation (Table 17-like)
 * Body: { phase2: { finalEvaluations: [...] }, qaPairs: [...] }
 * Returns: { feedback, averageScore }
 */
app.post("/api/debate/phase3", async (req, res) => {
  try {
    startNdjson(res);
    const { phase2 = {}, qaPairs = [] } = req.body || {};
    const finals = Array.isArray(phase2?.finalEvaluations) ? phase2.finalEvaluations : [];

    writeLine(res, { type: "info", message: "Phase 3 started (aggregator active)." });
    if (!finals.length) {
      writeLine(res, { type: "error", message: "Missing Phase 2 final evaluations." });
      return res.end();
    }

    const avg = finals.reduce((a, e) => a + Number(e?.score || 0), 0) / Math.max(1, finals.length);

    if (USE_MOCK) {
      writeLine(res, { result: { feedback: "Mock aggregator synthesis.", averageScore: Number(avg.toFixed(2)) }});
      writeLine(res, { type: "success", message: "Phase 3 complete." });
      return res.end();
    }

    if (!createStructuredJSON) {
      writeLine(res, { type: "error", message: "OpenAI client not initialized." });
      return res.end();
    }

    const tmpl = await readPrompt("phase3Aggregator.txt");
    const aggSchema = {
      type: "object",
      properties: { feedback: { type: "string" } },
      required: ["feedback"],
      additionalProperties: false
    };

    const prompt = tmpl
      .replace("{FINALS}", JSON.stringify(finals, null, 2))
      .replace("{QA_PAIRS}", JSON.stringify(qaPairs, null, 2));

    const result = await createStructuredJSON({
      instructions: "Return strictly valid JSON for the aggregation.",
      input: [{ role: "user", content: prompt }],
      schema: aggSchema,
      model: "gpt-4.1-mini",
      temperature: 0.2
    });

    writeLine(res, {
      result: {
        feedback: String(result?.feedback ?? ""),
        averageScore: Number(avg.toFixed(2))
      }
    });
    writeLine(res, { type: "success", message: "Phase 3 complete." });
    res.end();
  } catch (err) {
    writeLine(res, { type: "error", message: err.message || "Phase 3 failed." });
    res.end();
  }
});




// ---------- Start ----------
const port = process.env.PORT || 3001;
const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  console.log(`[ENV] MOCK_OPENAI = ${process.env.MOCK_OPENAI || "(unset)"}`);
  console.log(`[ENV] OPENAI_API_KEY present?  ${!!process.env.OPENAI_API_KEY}`);
  console.log(`[ENV] USE_MOCK = ${USE_MOCK}`);
});

// Graceful shutdown so nodemon restarts don’t leave the port busy
function shutdown(sig) {
  console.log(`\nReceived ${sig}. Closing HTTP server...`);
  server.close(() => {
    console.log("HTTP server closed.");
    if (sig === "SIGUSR2") {
      // required handshake so nodemon can restart
      process.kill(process.pid, "SIGUSR2");
    } else {
      process.exit(0);
    }
  });
}

process.once("SIGUSR2", () => shutdown("SIGUSR2")); // nodemon restart
process.on("SIGINT", () => shutdown("SIGINT"));     // ctrl+c
process.on("SIGTERM", () => shutdown("SIGTERM"));