/**
 * interpreter.ts — Service layer for all LLM interactions.
 *
 * Port of Python services/interpreter.py.
 * Encapsulates every call to the on-device LLM (via llama.rn).
 * No graph node should call llama.rn directly — they call methods here.
 *
 * Methods:
 *   - classifyIntent()      → Gatekeeper: classifies user intent(s)
 *   - synthesizeResponse()  → Synthesis: generates the final Spanish response
 *   - extractSummary()      → Scribe mode: summarizes a doctor visit transcript
 *   - embedSummary()        → Embedding: converts text to a float vector
 */

import {
  initLlama,
  type LlamaContext,
  type NativeCompletionResult,
} from "llama.rn";
import { z } from "zod";

import { ActionItemSchema } from "@/lib/action_items";
import {
  GatekeeperResultSchema,
  type GatekeeperResult,
} from "@/lib/graph/intents";
import {
  getLlamaModelUri,
  modelFileExists,
} from "@/lib/services/model-manager";
import {
  EXTRACTION_PROMPT,
  GATEKEEPER_PROMPT,
  SYNTHESIS_PROMPT,
} from "@/lib/services/promptLoader";

// ---------------------------------------------------------------------------
// Zod schema for the full LLM extraction response (scribe mode).
// Mirrors Python's ExtractionResult Pydantic model.
// ---------------------------------------------------------------------------
const ExtractionResultSchema = z.object({
  english_summary: z.string(),
  spanish_summary: z.string(),
  action_items: z.array(ActionItemSchema),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ---------------------------------------------------------------------------
// Helper: Extract JSON from LLM response text
// ---------------------------------------------------------------------------
function extractJson(text: string): string {
  // Try to extract JSON from markdown code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0].trim();
  }

  // Return as-is and let JSON.parse handle the error
  return text.trim();
}

// ---------------------------------------------------------------------------
// Helper: Pre-process gatekeeper response to uppercase action_type values
// Mirrors Python's case_insensitive_action_types model_validator
// ---------------------------------------------------------------------------
function normalizeGatekeeperResponse(
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (
    data.ACTION_ITEM_REQUEST &&
    typeof data.ACTION_ITEM_REQUEST === "object" &&
    data.ACTION_ITEM_REQUEST !== null
  ) {
    const request = data.ACTION_ITEM_REQUEST as Record<string, unknown>;
    if (typeof request.action_type === "string") {
      request.action_type = request.action_type
        .toUpperCase()
        .replace(/ /g, "_");
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// Helper: Pre-process extraction response to uppercase action_type values
// Mirrors Python's case_insensitive_action_types model_validator
// ---------------------------------------------------------------------------
function normalizeExtractionResponse(
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (Array.isArray(data.action_items)) {
    for (const item of data.action_items) {
      if (typeof item === "object" && item !== null && "action_type" in item) {
        const castItem = item as Record<string, unknown>;
        if (typeof castItem.action_type === "string") {
          castItem.action_type = castItem.action_type
            .toUpperCase()
            .replace(/ /g, "_");
        }
      }
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// InterpretationService
// ---------------------------------------------------------------------------
export class InterpretationService {
  private ctx: LlamaContext;

  /**
   * @param ctx - A pre-initialized LlamaContext from llama.rn's initLlama().
   *              The caller is responsible for loading the model first.
   */
  private constructor(ctx: LlamaContext) {
    this.ctx = ctx;
  }

  /**
   * Factory method to make model
   * @returns Interpretation Service
   */
  static async create(): Promise<InterpretationService> {
    console.log("[Interpreter] Initializing LLM");

    const modelUri = getLlamaModelUri();
    const exists = await modelFileExists(modelUri);
    if (!exists) {
      throw new Error(
        `LLM model not found at ${modelUri}. Install the model before starting the app.`,
      );
    }

    const cleanPath = modelUri.replace("file://", "");

    console.log(
      "[Interpreter] Initializing LlamaContext with path:",
      cleanPath,
    );
    const ctx = await initLlama({
      model: cleanPath,
      use_mlock: false, // force system to keep model in RAM // turning it off bc of crashing issues
      n_ctx: 2048, // ctx window size (can adjust based on memory)
      n_gpu_layers: 0,
    });
    // ADD THIS LOG:
    console.log("[Interpreter] GPU Enabled?", ctx.gpu);
    console.log("[Interpreter] Reason no GPU (if any):", ctx.reasonNoGPU);

    console.log("[Interpreter] LlamaContext initialized successfully");
    return new InterpretationService(ctx);
  }

  // ----- Gatekeeper (intent classification) -----

  /**
   * Sends the user's message to the LLM with the gatekeeper prompt
   * and returns a validated GatekeeperResult.
   *
   * If the LLM returns JSON that doesn't match the schema,
   * Zod throws a ZodError with a detailed report.
   */
  async classifyIntent(userInput: string): Promise<GatekeeperResult> {
    console.log("[Interpreter] Classifying user intent:", userInput);

    const prompt = GATEKEEPER_PROMPT.replace("{user_input}", userInput);

    const response: NativeCompletionResult = await this.ctx.completion({
      prompt,
      n_predict: 512,
      temperature: 0.1, // Low temperature for structured output
      stop: ["\n\n"], // Stop after the JSON block
    });

    const rawText = response.text;
    console.log("[Interpreter] Gatekeeper raw response:", rawText);

    // Parse and validate the JSON response
    const jsonString = extractJson(rawText);
    const parsed = JSON.parse(jsonString) as Record<string, unknown>;
    const normalized = normalizeGatekeeperResponse(parsed);
    const result = GatekeeperResultSchema.parse(normalized);

    console.log("[Interpreter] Gatekeeper intents parsed:", result);
    return result;
  }

  // ----- Synthesis (final response generation) -----

  /**
   * Generates a warm, patient-friendly response in Spanish.
   * Returns the raw text response (not JSON).
   */
  async synthesizeResponse(
    conversationHistory: string,
    databaseContext: string,
  ): Promise<string> {
    console.log("[Interpreter] Generating synthesis response");

    const prompt = SYNTHESIS_PROMPT.replace(
      "{conversation_history}",
      conversationHistory,
    ).replace("{database_context}", databaseContext);

    const response: NativeCompletionResult = await this.ctx.completion({
      prompt,
      n_predict: 512,
      temperature: 0.7, // More creative for natural language
    });

    const result = response.text || "Lo siento, no pude generar una respuesta.";
    console.log("[Interpreter] Synthesis response:", result.substring(0, 100));
    return result;
  }

  // ----- Scribe mode (visit transcript extraction) -----

  /**
   * Summarizes a doctor visit transcript and extracts action items.
   * Returns a validated ExtractionResult with typed fields.
   */
  async extractSummary(transcribedText: string): Promise<ExtractionResult> {
    const startTime = Date.now();
    console.log("[Interpreter] Starting summary extraction", {
      timestamp: new Date().toISOString(),
    });

    const prompt = EXTRACTION_PROMPT.replace(
      "{transcribed_text}",
      transcribedText,
    );

    const response: NativeCompletionResult = await this.ctx.completion({
      prompt,
      n_predict: 1024, // Extraction can be longer
      temperature: 0.2, // Low temperature for structured output
    });

    const rawText = response.text;
    console.log(
      "[Interpreter] Raw extraction response:",
      rawText.substring(0, 200),
    );

    const jsonString = extractJson(rawText);
    const parsed = JSON.parse(jsonString) as Record<string, unknown>;
    const normalized = normalizeExtractionResponse(parsed);
    const result = ExtractionResultSchema.parse(normalized);

    console.log(
      "[Interpreter] Summary extraction finished in",
      Date.now() - startTime,
      "ms",
    );
    return result;
  }

  // ----- Embeddings -----

  /**
   * Generates a 1024-dimensional float vector from text using
   * the LLM's embedding capability.
   *
   * NOTE: This uses the same LlamaContext. If you need a separate
   * embedding model, initialize a second context with pooling_type: 'mean'
   * and the embedding GGUF file.
   */
  async embedSummary(summaryText: string): Promise<number[]> {
    console.log("[Interpreter] Generating embedding vector");
    const result = await this.ctx.embedding(summaryText);
    return result.embedding;
  }

  /**
   * Optional: cleanup method to free up memory
   */
  async release(): Promise<void> {
    if (this.ctx) {
      await this.ctx.release();
      console.log("[Interpreter] LlamaContext released");
    }
  }
}
