/**
 * nodes.ts — Graph node functions for the Abuela Assistant.
 *
 * Port of Python graph/nodes.py.
 * Each function is a "node" in the pipeline. A node receives the current
 * AgentState and service instances, does work, and returns a partial state
 * update object. The router/orchestrator merges the update back into state.
 *
 * IMPORTANT: Nodes do NOT call llama.rn directly. All LLM interactions go
 * through InterpretationService.
 */

import type { DatabaseManager } from '@/lib/database/manager';
import type { GatekeeperResult } from '@/lib/graph/intents';
import type { AgentState } from '@/lib/graph/state';
import type { InterpretationService } from '@/lib/services/interpreter';

// ---------------------------------------------------------------------------
// Partial state update type — nodes return only the keys they modify
// ---------------------------------------------------------------------------
export type StateUpdate = Partial<Pick<AgentState, 'intents' | 'database_context' | 'messages'>>;

// ---------------------------------------------------------------------------
// GATEKEEPER NODE
// ---------------------------------------------------------------------------

/**
 * The first node in the graph. Takes the user's latest message and sends it
 * to the InterpretationService for intent classification.
 *
 * The router checks which intent fields are not null and sends the state
 * to the corresponding tool nodes.
 */
export async function gatekeeperNode(
  state: AgentState,
  interpreter: InterpretationService,
): Promise<StateUpdate> {
  console.log('[Node] Gatekeeper activated');

  const messages = state.messages;
  if (!messages || messages.length === 0) {
    console.warn('[Node] No messages in state, returning empty intents');
    const emptyResult: GatekeeperResult = {
      LOG_SYMPTOM: null,
      ACTION_ITEM_REQUEST: null,
      GENERAL_QUESTION: null,
    };
    return { intents: emptyResult };
  }

  // The last message is the most recent user input
  const latestMessage = messages[messages.length - 1];
  const userInput = latestMessage.content || '';
  console.log('[Node] Gatekeeper processing:', userInput);

  try {
    const result = await interpreter.classifyIntent(userInput);
    return { intents: result };
  } catch (error) {
    // The LLM returned JSON that didn't match the schema.
    // Return empty intents — the router will fall back to synthesis.
    console.error('[Node] Gatekeeper validation failed:', error);
    return {
      intents: {
        LOG_SYMPTOM: null,
        ACTION_ITEM_REQUEST: null,
        GENERAL_QUESTION: null,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// LOG SYMPTOM NODE
// ---------------------------------------------------------------------------

/**
 * Logs a symptom to the SQLite database.
 * Only fires when the gatekeeper detected a LOG_SYMPTOM intent.
 */
export async function logSymptomNode(
  state: AgentState,
  db: DatabaseManager,
): Promise<StateUpdate> {
  console.log('[Node] Log symptom activated');

  try {
    const intents = state.intents;
    if (!intents?.LOG_SYMPTOM) {
      return {
        database_context: ['Error: logSymptomNode called without LOG_SYMPTOM intent'],
      };
    }

    const symptomDescription = intents.LOG_SYMPTOM.symptom_description;
    console.log('[Node] Logging symptom:', symptomDescription);

    // Write to SQLite — returns the new symptom_id
    const symptomId = await db.insertSymptom(symptomDescription);

    const confirmation =
      `Symptom logged successfully (ID: ${symptomId}): ${symptomDescription}`;
    console.log('[Node]', confirmation);

    return { database_context: [confirmation] };
  } catch (error) {
    // Graceful degradation: return a clean error string.
    // The synthesis node will explain the issue gently to the patient.
    const errorMsg = `Error logging symptom: ${String(error)}`;
    console.error('[Node]', errorMsg);
    return { database_context: [errorMsg] };
  }
}

// ---------------------------------------------------------------------------
// ACTION ITEM NODE
// ---------------------------------------------------------------------------

/**
 * Queries the SQLite database for action items (medications, follow-ups, etc.)
 * Only fires when the gatekeeper detected an ACTION_ITEM_REQUEST intent.
 */
export async function actionItemNode(
  state: AgentState,
  db: DatabaseManager,
): Promise<StateUpdate> {
  console.log('[Node] Action item activated');

  try {
    const intents = state.intents;
    if (!intents?.ACTION_ITEM_REQUEST) {
      return {
        database_context: ['Error: actionItemNode called without ACTION_ITEM_REQUEST intent'],
      };
    }

    const actionTypeStr = intents.ACTION_ITEM_REQUEST.action_type.toUpperCase();
    const targetCondition = intents.ACTION_ITEM_REQUEST.target_condition;

    console.log('[Node] Querying action items:', actionTypeStr, targetCondition);

    // Query SQLite for matching action items
    const results = await db.queryActionItems(
      actionTypeStr as import('@/lib/action_items').ActionType,
      targetCondition || undefined,
    );

    let resultText: string;
    if (results.length > 0) {
      const formatted = results.map(
        (item) =>
          `- Type: ${item.action_type}, Details: ${JSON.stringify(item.action_description)}`,
      );
      resultText =
        `Found ${results.length} action item(s) for type '${actionTypeStr}':\n` +
        formatted.join('\n');
    } else {
      resultText = `No action items found for type '${actionTypeStr}'` +
        (targetCondition ? ` related to '${targetCondition}'` : '');
    }

    console.log('[Node] Action item query complete, count:', results.length);
    return { database_context: [resultText] };
  } catch (error) {
    const errorMsg = `Error querying action items: ${String(error)}`;
    console.error('[Node]', errorMsg);
    return { database_context: [errorMsg] };
  }
}

// ---------------------------------------------------------------------------
// GENERAL QUESTION NODE
// ---------------------------------------------------------------------------

/**
 * Performs semantic search against past visit transcripts in SQLite.
 * Only fires when the gatekeeper detected a GENERAL_QUESTION intent.
 */
export async function generalQuestionNode(
  state: AgentState,
  db: DatabaseManager,
  interpreter: InterpretationService,
): Promise<StateUpdate> {
  console.log('[Node] General question activated');

  try {
    const intents = state.intents;
    if (!intents?.GENERAL_QUESTION) {
      return {
        database_context: ['Error: generalQuestionNode called without GENERAL_QUESTION intent'],
      };
    }

    const queryText = intents.GENERAL_QUESTION.query;
    if (!queryText) {
      return {
        database_context: ['No search query was provided by the gatekeeper.'],
      };
    }

    console.log('[Node] Running semantic search:', queryText);

    // Step 1: Convert the text query into a float vector (embedding)
    const queryVector = await interpreter.embedSummary(queryText);

    // Step 2: Run cosine similarity search against the summaries table
    const results = await db.semanticSearch(queryVector);

    let resultText: string;
    if (results.length > 0) {
      const formatted = results.map(
        (r) => `- [Score: ${r.similarity_score.toFixed(2)}] ${r.english_transcript}`,
      );
      resultText =
        `Found ${results.length} relevant transcript(s):\n` + formatted.join('\n');
    } else {
      resultText = 'No relevant transcripts found for this question.';
    }

    console.log('[Node] Semantic search complete, count:', results.length);
    return { database_context: [resultText] };
  } catch (error) {
    const errorMsg = `Error during semantic search: ${String(error)}`;
    console.error('[Node]', errorMsg);
    return { database_context: [errorMsg] };
  }
}

// ---------------------------------------------------------------------------
// SYNTHESIS NODE
// ---------------------------------------------------------------------------

/**
 * The LAST node before END. Gathers everything — conversation history and
 * database results — and generates the final patient-friendly response.
 *
 * This node ALWAYS runs, regardless of which tool nodes fired before it.
 */
export async function synthesisNode(
  state: AgentState,
  interpreter: InterpretationService,
): Promise<StateUpdate> {
  console.log('[Node] Synthesis activated');

  try {
    // Gather the full conversation history for context
    const conversationHistory = state.messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    // Gather all database results (could be multiple if parallel nodes ran)
    const databaseContext = state.database_context.length > 0
      ? state.database_context.join('\n')
      : 'No additional information available.';

    console.log(
      '[Node] Synthesis context:',
      state.messages.length, 'messages,',
      state.database_context.length, 'db items',
    );

    // Generate the final response via the LLM
    const assistantResponse = await interpreter.synthesizeResponse(
      conversationHistory,
      databaseContext,
    );

    console.log('[Node] Synthesis response:', assistantResponse.substring(0, 100));

    // Return as a new assistant message
    return {
      messages: [{ role: 'assistant', content: assistantResponse }],
    };
  } catch (error) {
    // Even if the LLM fails, return a gentle fallback message
    console.error('[Node] Synthesis failed:', error);
    const fallback =
      'Lo siento, tuve un problema generando la respuesta. ' +
      'Por favor, intente de nuevo. ' +
      '(Sorry, I had a problem generating the response. ' +
      'Please try again.)';
    return {
      messages: [{ role: 'assistant', content: fallback }],
    };
  }
}
