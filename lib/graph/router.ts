/**
 * router.ts — Graph routing and orchestration logic.
 *
 * Port of Python graph/router.py.
 * Provides:
 *   1. routeGatekeeper() — decides which tool nodes to run based on intents
 *   2. runGraph()        — lightweight orchestrator that executes the full pipeline
 *
 * In Python this used LangGraph's StateGraph + Send for parallel execution.
 * Here we use a simple manual orchestrator that runs tool nodes concurrently
 * via Promise.all. When @langchain/langgraph JS is added later, this can be
 * replaced with a compiled StateGraph.
 */

import type { DatabaseManager } from '@/lib/database/manager';
import type { AgentState } from '@/lib/graph/state';
import type { InterpretationService } from '@/lib/services/interpreter';

import {
  gatekeeperNode,
  logSymptomNode,
  actionItemNode,
  generalQuestionNode,
  synthesisNode,
  type StateUpdate,
} from '@/lib/graph/nodes';

// ---------------------------------------------------------------------------
// Node name type for routing
// ---------------------------------------------------------------------------
export type NodeName = 'log_symptom' | 'action_item' | 'general_question' | 'synthesis';

// ---------------------------------------------------------------------------
// Services bundle passed to runGraph
// ---------------------------------------------------------------------------
export interface GraphServices {
  db: DatabaseManager;
  interpreter: InterpretationService;
}

// ---------------------------------------------------------------------------
// ROUTING FUNCTION
// ---------------------------------------------------------------------------

/**
 * Examines the intents parsed by the gatekeeper and returns a list of
 * node names that should be executed.
 *
 * In Python this returned Send objects for parallel execution.
 * Here we return string names and use Promise.all in the orchestrator.
 *
 * If no known intents are found, returns ['synthesis'] as a fallback.
 */
export function routeGatekeeper(state: AgentState): NodeName[] {
  const intents = state.intents;

  // If no intents at all, go straight to synthesis
  if (!intents) {
    return ['synthesis'];
  }

  const destinations: NodeName[] = [];

  if (intents.LOG_SYMPTOM !== null) {
    destinations.push('log_symptom');
  }

  if (intents.ACTION_ITEM_REQUEST !== null) {
    destinations.push('action_item');
  }

  if (intents.GENERAL_QUESTION !== null) {
    destinations.push('general_question');
  }

  // If no intents matched, go straight to synthesis
  if (destinations.length === 0) {
    destinations.push('synthesis');
  }

  return destinations;
}

// ---------------------------------------------------------------------------
// GRAPH ORCHESTRATOR
// ---------------------------------------------------------------------------

/**
 * Runs the full graph pipeline:
 *   START → gatekeeper → [tool node(s) in parallel] → synthesis → END
 *
 * This is a lightweight manual orchestrator. It:
 *   1. Adds the user's message to state
 *   2. Runs the gatekeeper node to classify intents
 *   3. Uses routeGatekeeper() to decide which tool nodes to run
 *   4. Runs all matching tool nodes in parallel (via Promise.all)
 *   5. Merges their database_context results
 *   6. Runs the synthesis node to generate the final response
 *   7. Returns the updated state with the assistant's response
 *
 * @param userInput - The user's text message (or transcribed audio)
 * @param services  - DatabaseManager and InterpretationService instances
 * @param state     - The current AgentState (for multi-turn conversation)
 * @returns The updated AgentState with the assistant's response appended
 */
export async function runGraph(
  userInput: string,
  services: GraphServices,
  state: AgentState,
): Promise<AgentState> {
  const { db, interpreter } = services;

  // --------------- Step 1: Add user message to state ---------------
  const currentState: AgentState = {
    ...state,
    messages: [...state.messages, { role: 'user', content: userInput }],
    database_context: [], // Reset for this turn
  };

  console.log('[Router] === Starting graph pipeline ===');

  // --------------- Step 2: Run gatekeeper ---------------
  const gatekeeperUpdate = await gatekeeperNode(currentState, interpreter);
  currentState.intents = gatekeeperUpdate.intents;

  console.log('[Router] Gatekeeper complete, routing...');

  // --------------- Step 3: Route to tool nodes ---------------
  const destinations = routeGatekeeper(currentState);
  console.log('[Router] Destinations:', destinations);

  // --------------- Step 4: Run tool nodes in parallel ---------------
  if (!destinations.includes('synthesis')) {
    // Map each destination to its node function
    const toolPromises: Promise<StateUpdate>[] = destinations.map((dest) => {
      switch (dest) {
        case 'log_symptom':
          return logSymptomNode(currentState, db);
        case 'action_item':
          return actionItemNode(currentState, db);
        case 'general_question':
          return generalQuestionNode(currentState, db, interpreter);
        default:
          return Promise.resolve({});
      }
    });

    // Run all tool nodes concurrently and merge their database_context
    const toolResults = await Promise.all(toolPromises);

    // Merge database_context from all tool nodes (like operator.add in Python)
    for (const result of toolResults) {
      if (result.database_context) {
        currentState.database_context.push(...result.database_context);
      }
    }

    console.log('[Router] Tool nodes complete, db_context items:', currentState.database_context.length);
  }

  // --------------- Step 5: Run synthesis ---------------
  const synthesisUpdate = await synthesisNode(currentState, interpreter);

  // Append the assistant's response to messages
  if (synthesisUpdate.messages) {
    currentState.messages = [...currentState.messages, ...synthesisUpdate.messages];
  }

  console.log('[Router] === Graph pipeline complete ===');
  return currentState;
}
