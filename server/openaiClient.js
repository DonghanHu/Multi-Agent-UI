// server/openaiClient.js
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const DEFAULT_TEMPERATURE = process.env.OPENAI_TEMPERATURE
  ? Number(process.env.OPENAI_TEMPERATURE)
  : 0.2;
const DEFAULT_MAX_OUTPUT_TOKENS = process.env.OPENAI_MAX_OUTPUT_TOKENS
  ? Number(process.env.OPENAI_MAX_OUTPUT_TOKENS)
  : 4096;

/**
 * Ensure an object schema is strict-mode friendly.
 * - guarantee type: "object"
 * - add empty properties/required if omitted
 */
function normalizeStrictObjectSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;

  // If top-level is an object schema with dynamic keys via additionalProperties,
  // strict mode still requires properties/required to be present.
  if (schema.type === "object") {
    if (!("properties" in schema)) schema.properties = {};
    if (!("required" in schema)) schema.required = [];
  }

  // Recursively normalize nested additionalProperties (if it’s a schema)
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    normalizeStrictObjectSchema(schema.additionalProperties);
  }

  // Recursively normalize each property’s schema (if any)
  if (schema.properties && typeof schema.properties === "object") {
    for (const key of Object.keys(schema.properties)) {
      normalizeStrictObjectSchema(schema.properties[key]);
    }
  }

  // Arrays: normalize item schemas too
  if (schema.items && typeof schema.items === "object") {
    normalizeStrictObjectSchema(schema.items);
  }

  return schema;
}

/**
 * Create JSON-structured output with the Responses API.
 * @param {Object} opts
 * @param {string} opts.instructions - system-style guidance
 * @param {Array<{role:string, content:string}>} opts.input - chat-like turns
 * @param {Object} opts.schema - JSON Schema for strict JSON
 * @param {string} [opts.model="gpt-4.1-mini"]
 * @param {number} [opts.temperature=0.2]
 * @param {number} [opts.max_output_tokens=4096]
 */
export async function createStructuredJSON({
  instructions,
  input,
  schema,
  model = DEFAULT_MODEL,
  temperature = DEFAULT_TEMPERATURE,
  max_output_tokens = DEFAULT_MAX_OUTPUT_TOKENS
}) {
  // Normalize schema for strict mode safety.
  const safeSchema = normalizeStrictObjectSchema(schema);

  // Compose Responses API input (messages-style)
  const messages = [
    { role: "system", content: [{ type: "input_text", text: instructions || "" }] },
    ...((input || []).map(m => ({
      role: m.role || "user",
      content: [{ type: "input_text", text: String(m.content ?? "") }]
    })))
  ];

  try {
    const resp = await openai.responses.create({
      model,
      temperature,
      max_output_tokens,
      input: messages,
      text: {
        format: {
          type: "json_schema",
          name: "result",
          schema: safeSchema,
          strict: true
        }
      }
    });

    const text = resp.output_text || "{}";
    return JSON.parse(text);
  } catch (err) {
    // Improve visibility when schema errors happen
    console.error("[OpenAI] createStructuredJSON error:");
    if (err?.status) console.error(" status:", err.status);
    if (err?.code) console.error(" code:", err.code);
    if (err?.param) console.error(" param:", err.param);
    if (err?.error?.message) console.error(" message:", err.error.message);
    // Re-throw so your route can handle 500s consistently
    throw err;
  }
}
