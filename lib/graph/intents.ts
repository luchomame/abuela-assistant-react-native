/**
 * intents.ts — Zod schemas for the gatekeeper's intent classification.
 *
 * Port of Python graph/entities/intents.py.
 * These schemas mirror the JSON structure defined in gatekeeper_instructions.txt.
 * When the gatekeeper LLM returns JSON, we validate it with GatekeeperResultSchema.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Individual intent payload schemas
// ---------------------------------------------------------------------------

/** Payload when the user describes a symptom they're experiencing. */
export const LogSymptomIntentSchema = z.object({
  symptom_description: z.string(),
});
export type LogSymptomIntent = z.infer<typeof LogSymptomIntentSchema>;

/** Payload when the user asks about medications, follow-ups, etc. */
export const ActionItemRequestIntentSchema = z.object({
  action_type: z.string(),
  // target_condition is optional — the user might ask
  // "what medications do I take?" without specifying a condition.
  target_condition: z.string().default(''),
});
export type ActionItemRequestIntent = z.infer<typeof ActionItemRequestIntentSchema>;

/** Payload when the user asks a general medical question. */
export const GeneralQuestionIntentSchema = z.object({
  query: z.string(),
});
export type GeneralQuestionIntent = z.infer<typeof GeneralQuestionIntentSchema>;

// ---------------------------------------------------------------------------
// Top-level gatekeeper result
// ---------------------------------------------------------------------------

/**
 * The full JSON response from the gatekeeper LLM.
 * Each field is null when that intent was not detected.
 * Multiple fields can be non-null simultaneously (multi-intent).
 *
 * Example LLM output for "My knee hurts, what medicine should I take?":
 * {
 *   "LOG_SYMPTOM": { "symptom_description": "knee pain" },
 *   "ACTION_ITEM_REQUEST": { "action_type": "medication", "target_condition": "knee pain" },
 *   "GENERAL_QUESTION": null
 * }
 */
export const GatekeeperResultSchema = z.object({
  LOG_SYMPTOM: LogSymptomIntentSchema.nullable().default(null),
  ACTION_ITEM_REQUEST: ActionItemRequestIntentSchema.nullable().default(null),
  GENERAL_QUESTION: GeneralQuestionIntentSchema.nullable().default(null),
});
export type GatekeeperResult = z.infer<typeof GatekeeperResultSchema>;
