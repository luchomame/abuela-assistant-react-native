# System Design Document: Abuela Assistant (Mobile Architecture)

## 1. Executive Summary

**Objective:** Transition the Abuela Assistant from a local, Python-based desktop application to a fully offline, privacy-first React Native mobile application.

**The Goal:** Empower elderly, bilingual (or Spanish-speaking) patients to record their English-speaking doctor visits, automatically extract structured medical data (medications, symptoms, follow-ups), and interact with that data via a voice-first chat interface—all without sending sensitive health data to the cloud.

---

## 2. Current State vs. Target Architecture

| Component           | Current State (Desktop Python)  | Target State (React Native Mobile)         |
| ------------------- | ------------------------------- | ------------------------------------------ |
| Orchestrator        | LangGraph (Python)              | @langchain/langgraph (Node/JS)             |
| Schema Validation   | Pydantic                        | Zod                                        |
| Local Database      | DuckDB                          | expo-sqlite (using Proxy Pattern)          |
| Vector Search       | DuckDB Array/Cosine functions   | sqlite-vss (or vector polyfill)            |
| Audio Transcription | OpenAI Whisper (Python wrapper) | whisper.rn (C++ bindings via React Native) |
| LLM Inference       | Ollama daemon running Qwen3     | react-native-llama (llama.cpp bindings)    |
| Asset Delivery      | Manually pulled via CLI         | expo-file-system (First-launch download)   |

### The Local AI Stack (GGUF Artifacts)

The mobile environment requires strict memory management. We are bypassing API calls and daemon servers (like Ollama) in favor of running quantized `.gguf` and `.bin` models directly on the device's CPU/NPU using C++ bindings.

- **LLM (Text Generation):** Qwen3 0.6B — **Q4_0 quantization** (preferred over Q4_K_M; Q4_0 is optimized for llama.cpp mobile inference throughput at this parameter scale).
  - Source: https://huggingface.co/unsloth/Qwen3-0.6B-GGUF

- **Embedding Model:** Qwen3 Embedding 0.6B GGUF.
  - Source: https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF

- **Transcription:** Whisper `tiny.en` — English-only, small footprint (~142MB) for instant, local processing without exhausting device RAM.

> **Engine loading strategy:** Initialize `whisper.rn` eagerly on app start. Lazy-load `react-native-llama` only after transcription completes. The two engines cannot safely run in parallel within the 1.5GB RAM budget, and sequential execution covers all real user flows.

---

## 3. UI/UX Architecture & Routing

The UI is intentionally constrained to minimize cognitive load for the target demographic. We use a strictly typed React Navigation setup (Stack Navigator for Onboarding → Bottom Tab Navigator for core features).

### Route 1: OnboardingScreen (Stack)

**Trigger:** Runs only on the first application launch.

**Functionality:**

1. Captures the user's name.
2. Captures the preferred output language (e.g., Spanish).
3. Executes `expo-file-system` resumable downloads to fetch the Qwen and Whisper models from Hugging Face.
4. Displays a localized progress bar (`"Configurando a tu asistente..."`).

### Route 2: ClinicScreen (Bottom Tab 1)

**Trigger:** The patient is at the doctor's office.

**UI:** A massive, high-contrast "Record Appointment" toggle button.

**Data Flow:** Triggers continuous `whisper.rn` audio capture. Upon stopping, the text is passed to the LangGraph pipeline for parsing, translation, and database insertion.

**Output:** Renders a static "Visit Summary" UI card showing newly prescribed medications and follow-up instructions in the user's preferred language.

### Route 3: AssistantChatScreen (Bottom Tab 2)

**Trigger:** The patient is at home and has a question or symptom.

**UI:** A scrollable chat history interface featuring both a text input box and a "Hold to Speak" microphone button.

**Data Flow:** Routes audio through `whisper.rn` (if spoken), runs the intent Gatekeeper, queries SQLite, and streams the Spanish response back into the chat UI.

---

## 4. Functional Requirements

- **FR1 (Scribe Mode):** The system must record live audio, utilize a local Voice Activity Detection (VAD) buffer, and transcribe English medical speech to text entirely offline.
- **FR2 (Intent Routing):** The system must parse user inputs (text or transcribed voice) and classify them into strict intents (`LOG_SYMPTOM`, `ACTION_ITEM_REQUEST`, `GENERAL_QUESTION`) via structured JSON output validated by Zod.
- **FR3 (Data Extraction & Storage):** The system must extract entities (medication name, dosage, frequency) and store them in SQLite. The `action_items` payload must be stored as a JSON text column to guarantee future compatibility with PostgreSQL/Supabase `jsonb` types.
- **FR4 (Semantic Search):** The system must vectorize general questions and perform cosine similarity searches against historical visit transcripts to answer longitudinal health questions.
- **FR5 (Dynamic Localization):** The system must inject the user's preferred language (saved in SQLite during onboarding) into the LangGraph `AgentState` so the final synthesis node always translates the structured data dynamically.

---

## 5. Non-Functional Requirements

- **NFR1 (Privacy/Security):** Zero patient data (audio, transcripts, symptoms, or chat history) may leave the device. Network requests are strictly limited to the initial Hugging Face model downloads.
- **NFR2 (Memory Bounds):** Total RAM allocation during LLM generation must not exceed 1.5GB to prevent the mobile OS from force-killing the application.
- **NFR3 (Resiliency):** Model downloads via `expo-file-system` must be resumable and validate file size upon completion to prevent corrupted `.gguf` files from crashing the `llama.rn` C++ engine.
- **NFR4 (Graceful Degradation):** If a local database query fails or the LLM hallucinates an invalid JSON structure (caught by Zod), the system must fall back to a hardcoded, localized apology string without crashing the UI.

---

## 6. Architecture Canvas (Data Flow & State)

### The AgentState Definition (TypeScript)

```typescript
interface AgentState {
  messages: BaseMessage[];
  transcription?: string;
  target_language: string; // Injected from SQLite user profile
  intents?: {
    LOG_SYMPTOM?: boolean;
    ACTION_ITEM_REQUEST?: boolean;
    GENERAL_QUESTION?: boolean;
    extracted_entities?: Record<string, any>;
  };
  database_context: any[];
}
```

### Component Interaction Diagram (Conceptual)

1. **User Input:** Microphone button pressed → `expo-av` captures audio PCM stream.
2. **Async Transcription:** PCM stream → `whisper.rn` (C++ Engine) → Returns raw English string.
3. **Graph Initialization:** UI triggers LangGraph.js execution, passing the string and `target_language`.
4. **Gatekeeper Node (LLM Sync):** State → `react-native-llama` evaluates prompt → Outputs JSON string.
5. **Validation Sync:** JSON string → `zod.parse()`. (Throws error if schema fails, triggering graph retry or fallback).
6. **Tool Execution (DB Sync):** Zod Object → `DatabaseManager` (SQLite Proxy) → Executes `SELECT json_extract(...)` or `INSERT`.
7. **Synthesis Node (LLM Async):** DB results & Context → `react-native-llama` generates final response in `target_language` → Streams back to React Native UI via channel reducer.

---

## 7. Database Architecture

### Design Philosophy

The SQLite schema uses a two-tier structure: **general-purpose core tables** that apply across all use cases, and **use-case-specific schema extensions** that get added as the app expands beyond medical. This avoids premature coupling to a single domain while keeping the core tables stable.

The Python POC schemas were tightly coupled to medical entities (medications, symptoms, follow-ups). Those concepts are preserved but scoped to a `medical` domain layer, not baked into the core schema.

### Core Tables (Domain-Agnostic)

```sql
-- All recorded sessions regardless of context
CREATE TABLE transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  domain TEXT NOT NULL,          -- 'medical', 'personal', 'activity', etc.
  raw_text TEXT NOT NULL,
  summary TEXT,
  language TEXT DEFAULT 'en'
);

-- Extracted action items from any session
CREATE TABLE action_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transcript_id INTEGER REFERENCES transcripts(id),
  domain TEXT NOT NULL,
  payload TEXT NOT NULL,         -- JSON text column; future-compatible with Supabase jsonb
  status TEXT DEFAULT 'pending',
  due_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User profile (name, language preference, settings)
CREATE TABLE user_profile (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT,
  preferred_language TEXT DEFAULT 'es',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Domain Extension: Medical

```sql
CREATE TABLE medical_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transcript_id INTEGER REFERENCES transcripts(id),
  entity_type TEXT NOT NULL,     -- 'medication', 'symptom', 'follow_up', 'dosage'
  entity_value TEXT NOT NULL,
  metadata TEXT,                 -- JSON for extra fields (frequency, dosage unit, etc.)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Domain Extension: Personal / Activity

For non-medical queries ("what was the date of the funeral", "when did I last see my sister"), a lightweight personal events table handles this without polluting the medical schema:

```sql
CREATE TABLE personal_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_label TEXT NOT NULL,     -- e.g., 'funeral', 'birthday', 'appointment'
  event_date DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

New use cases (e.g., a calendar domain, a medication refill tracker) get their own tables following this same pattern. The `domain` column on `transcripts` and `action_items` is what ties sessions back to the right extension tables without requiring a schema migration to the core.

---

## 8. State Machine Architecture

### Phase 6.x: Switch-Statement FSM (Current)

Before wiring in LangGraph.js, intent routing is implemented as a simple TypeScript FSM using switch statements. This allows the UI, database layer, and Zod schemas to be built and validated independently of the graph orchestration logic.

**Critical constraint:** Even in the switch-statement phase, all state must conform to the `AgentState` interface defined in Section 6. The routing logic is what gets replaced by LangGraph — not the state shape.

```typescript
function routeIntent(state: AgentState): AgentState {
  const intent = state.intents;
  switch (true) {
    case intent?.LOG_SYMPTOM:
      return handleLogSymptom(state);
    case intent?.ACTION_ITEM_REQUEST:
      return handleActionItemRequest(state);
    case intent?.GENERAL_QUESTION:
      return handleGeneralQuestion(state);
    default:
      return handleFallback(state);
  }
}
```

### Phase 6.x+1: LangGraph.js Migration

The LangGraph migration is a routing swap only. The nodes (`handleLogSymptom`, etc.) stay unchanged. The switch block is replaced by a compiled `StateGraph` with typed edges.

---

## 9. Implementation Notes & Recommendations

### Define Zod Schemas Before Building Nodes

The entire pipeline's resilience (NFR4) depends on Zod catching malformed LLM output. Define `MedicationSchema`, `IntentSchema`, and `ActionItemSchema` first. Build graph nodes around what those schemas expect, not the other way around. Schema-first prevents a painful retrofit later.

### expo-sqlite Proxy Pattern is Load-Bearing

SQLite on React Native is synchronous; LangGraph.js expects async. The `DatabaseManager` class must wrap all queries in Promises from day one. Example:

```typescript
class DatabaseManager {
  async query(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      db.transaction((tx) => {
        tx.executeSql(
          sql,
          params,
          (_, result) => resolve(result.rows._array),
          (_, error) => {
            reject(error);
            return false;
          },
        );
      });
    });
  }
}
```

### Q4_0 vs. Q4_K_M

Use **Q4_0** for the Qwen3 0.6B model. At this parameter scale, Q4_0 is better optimized for llama.cpp's mobile inference path than Q4_K_M. Q4_K_M's quality improvements are more meaningful at larger model sizes (7B+) where the extra overhead is worth it.

### Model Loading: Lazy-Load the LLM

Do not eagerly initialize both engines on app start. The whisper + llama combined footprint pushes the 1.5GB RAM ceiling (NFR2).

- Initialize `whisper.rn` on app start (needed immediately for ClinicScreen).
- Initialize `react-native-llama` only after transcription completes.
- All real user flows are sequential (transcribe → infer), so parallel initialization provides no UX benefit and significant crash risk.

### Download Validation in Onboarding

`expo-file-system` resumable downloads must validate file size on completion before the C++ engines attempt to load the model. A truncated `.gguf` silently crashes `llama.rn` with an opaque native error. Validate against the expected byte count (available from the Hugging Face model card) and re-trigger the download if it doesn't match.

---

## 10. Edge Architecture Strategies for Long-Context Audio

### The Challenge

Processing a 30+ minute doctor's appointment results in a massive token count (~10,000 tokens) that exceeds the `n_ctx` capabilities of a 0.6B local model running on mobile RAM. Running LLM inference concurrently with continuous audio recording also risks OS-level microphone locking, severe thermal throttling, and OOM crashes.

### 10.1. The Asynchronous Processing Pipeline (Map-Reduce)

**Concept:** Decouple audio capture from LLM inference during the high-stress period of the actual appointment.

**Execution:** During the visit, the app strictly functions as a dictaphone (recording and chunking audio to disk with VAD to strip silence). No LLM inference occurs. Once the user taps "End Visit," a background worker executes a Map-Reduce flow: transcribing chunks, generating mini-summaries for each, and finally passing the concatenated summaries to Qwen for final structured JSON extraction.

### 10.2. Hardware-Safe In-Visit Queries (Managing Microphone Locking)

**Strategy A: The "Hold On, Doctor" Pause Button (Safest Route)**

The UI features a prominent "Ask a Question" button during recording. Tapping it gracefully pauses the main visit recording buffer and flushes it to disk. This frees the microphone to listen to the user's specific query, runs the localized RAG retrieval, and generates a response. Tapping "Resume Visit" starts a new recording buffer (concatenated later).

**Strategy B: The "Push-to-Talk" Intercept (Advanced Routing)**

The app continuously records the room. A specific "Push-to-Talk" UI element intercepts the active audio stream when held. Instead of routing the PCM stream to the main visit buffer, it temporarily routes it to a "Query" buffer. Upon release, Whisper and Qwen process just the query buffer for a quick search, bypassing OS microphone locking.

### 10.3. The "Pre-Visit Cheat Sheet" (Proactive Mitigation)

**Concept:** Bypass the need for mid-appointment queries entirely.

**Execution:** Before entering the clinic, the user taps "Prepare for Doctor." The app runs a local query on the SQLite database for the last 30 days of symptoms or complaints. Qwen synthesizes this into a static, easy-to-read "Cheat Sheet" rendered on the screen. The user can simply read from the screen while the app safely dedicates all system resources to continuous recording.

---

## 11. Execution Roadmap

| Phase   | Focus                          | Key Deliverables                                                                                         |
| ------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **6.1** | Boilerplate & State Management | Expo project init, React Navigation (Stack + Tabs), Zod schemas, `AgentState` interface                  |
| **6.2** | Asset Pipeline                 | `OnboardingScreen` with `expo-file-system`, Qwen + Whisper download URLs, file-size validation           |
| **6.3** | Database Infrastructure        | `DatabaseManager` proxy class, `expo-sqlite` init, core + medical schema tables                          |
| **6.4** | C++ Engine Integration         | `react-native-llama` + `whisper.rn` install and config, local file path wiring, lazy-load pattern        |
| **6.5** | Graph Translation & UI Hookup  | Port Python `nodes.py` / `router.py` to async TypeScript, bind Scribe Mode + Chat Mode to compiled graph |
