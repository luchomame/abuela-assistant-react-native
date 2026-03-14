/**
 * state.ts — AgentState definition for the graph pipeline.
 *
 * Port of Python graph/state.py.
 * This is the data shape that flows through every node in the graph.
 * Each node receives the full state and returns a partial update.
 */

import type { GatekeeperResult } from '@/lib/graph/intents';

/**
 * The state object that flows through the graph pipeline.
 *
 * In Python this was a TypedDict with Annotated[list, operator.add]
 * to enable automatic list merging. In TypeScript we handle merging
 * manually in the router/orchestrator.
 */
export interface AgentState {
  /** Conversation history — each entry has a role and content string. */
  messages: Array<{ role: string; content: string }>;

  /** Raw transcription text from Whisper (only set when audio input is used). */
  transcription?: string;

  /**
   * The user's preferred output language, injected from the SQLite user_profile.
   * The synthesis node uses this to generate responses in the correct language.
   */
  target_language: string;

  /**
   * Intent classification parsed by the gatekeeper node.
   * Each intent field is either a typed payload or null.
   */
  intents?: GatekeeperResult;

  /**
   * Results from tool nodes (DB writes, queries, searches).
   * Each tool node appends its results as strings.
   * The synthesis node reads all of these to build the final response.
   */
  database_context: string[];
}

/**
 * Creates a fresh AgentState with sensible defaults.
 * Useful when starting a new conversation.
 */
export function createInitialState(targetLanguage: string = 'Spanish'): AgentState {
  return {
    messages: [],
    target_language: targetLanguage,
    database_context: [],
  };
}
