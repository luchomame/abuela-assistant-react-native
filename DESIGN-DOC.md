# System Design Document: Abuela Assistant (Mobile Architecture)

## 1. Executive Summary

**Objective:** Transition the Abuela Assistant from a local, Python-based desktop application to a fully offline, privacy-first React Native mobile application.
**The Goal:** Empower elderly, bilingual (or Spanish-speaking) patients to record their English-speaking doctor visits, automatically extract structured medical data (medications, symptoms, follow-ups), and interact with that data via a voice-first chat interface—all without sending sensitive health data to the cloud.

## 2. Current State vs. Target Architecture

| Component | Current State (Desktop Python) | Target State (React Native Mobile) |
| --- | --- | --- |
| **Orchestrator** | LangGraph (Python) | `@langchain/langgraph` (Node/JS) |
| **Schema Validation** | Pydantic | `Zod` |
| **Local Database** | DuckDB | `expo-sqlite` (using Proxy Pattern) |
| **Vector Search** | DuckDB Array/Cosine functions | `sqlite-vss` (or vector polyfill) |
| **Audio Transcription** | OpenAI Whisper (Python wrapper) | `whisper.rn` (C++ bindings via React Native) |
| **LLM Inference** | Ollama daemon running Qwen3 | `react-native-llama` (llama.cpp bindings) |
| **Asset Delivery** | Manually pulled via CLI | `expo-file-system` (First-launch download) |

### The Local AI Stack (GGUF Artifacts)

The mobile environment requires strict memory management. We are bypassing API calls and daemon servers (like Ollama) in favor of running quantized `.gguf` and `.bin` models directly on the device's CPU/NPU using C++ bindings.

* **LLM (Text Generation):** Qwen3 0.6B (4-bit Quantized GGUF).
* Source: `https://huggingface.co/unsloth/Qwen3-0.6B-GGUF`


* **Embedding Model:** Qwen3 Embedding 0.6B GGUF.
* Source: `https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF`


* **Transcription:** Whisper English-only (`tiny.en` or `base.en`). A small footprint model (~142MB) to ensure instant, local processing without exhausting device RAM.

---

## 3. UI/UX Architecture & Routing

The UI is intentionally constrained to minimize cognitive load for the target demographic. We use a strictly typed React Navigation setup (Stack Navigator for Onboarding $\rightarrow$ Bottom Tab Navigator for core features).

### Route 1: `OnboardingScreen` (Stack)

* **Trigger:** Runs only on the first application launch.
* **Functionality:** 1. Captures the user's name.
2. Captures the preferred output language (e.g., Spanish).
3. Executes `expo-file-system` resumable downloads to fetch the Qwen and Whisper models from Hugging Face.
4. Displays a localized progress bar ("Configurando a tu asistente...").

### Route 2: `ClinicScreen` (Bottom Tab 1)

* **Trigger:** The patient is at the doctor's office.
* **UI:** A massive, high-contrast "Record Appointment" toggle button.
* **Data Flow:** Triggers continuous `whisper.rn` audio capture. Upon stopping, the text is passed to the LangGraph pipeline for parsing, translation, and database insertion.
* **Output:** Renders a static "Visit Summary" UI card showing newly prescribed medications and follow-up instructions in the user's preferred language.

### Route 3: `AssistantChatScreen` (Bottom Tab 2)

* **Trigger:** The patient is at home and has a question or symptom.
* **UI:** A scrollable chat history interface featuring both a text input box and a "Hold to Speak" microphone button. *(Note: Can leverage the Vercel AI SDK's React Native components for clean chat state management if desired, though standard React state suffices).*
* **Data Flow:** Routes audio through `whisper.rn` (if spoken), runs the intent Gatekeeper, queries SQLite, and streams the Spanish response back into the chat UI.

---

## 4. Functional Requirements

* **FR1 (Scribe Mode):** The system must record live audio, utilize a local Voice Activity Detection (VAD) buffer, and transcribe English medical speech to text entirely offline.
* **FR2 (Intent Routing):** The system must parse user inputs (text or transcribed voice) and classify them into strict intents (`LOG_SYMPTOM`, `ACTION_ITEM_REQUEST`, `GENERAL_QUESTION`) via structured JSON output validated by Zod.
* **FR3 (Data Extraction & Storage):** The system must extract entities (Medication name, dosage, frequency) and store them in SQLite. The `action_items` payload must be stored as a JSON text column to guarantee future compatibility with PostgreSQL/Supabase `jsonb` types.
* **FR4 (Semantic Search):** The system must vectorize general questions and perform cosine similarity searches against historical visit transcripts to answer longitudinal health questions.
* **FR5 (Dynamic Localization):** The system must inject the user's preferred language (saved in SQLite during onboarding) into the LangGraph `AgentState` so the final synthesis node always translates the structured data dynamically.

---

## 5. Non-Functional Requirements

* **NFR1 (Privacy/Security):** Zero patient data (audio, transcripts, symptoms, or chat history) may leave the device. Network requests are strictly limited to the initial Hugging Face model downloads.
* **NFR2 (Memory Bounds):** Total RAM allocation during LLM generation must not exceed 1.5GB to prevent the mobile OS from force-killing the application.
* **NFR3 (Resiliency):** Model downloads via `expo-file-system` must be resumable and validate file size upon completion to prevent corrupted `.gguf` files from crashing the `llama.rn` C++ engine.
* **NFR4 (Graceful Degradation):** If a local database query fails or the LLM hallucinates an invalid JSON structure (caught by Zod), the system must fallback to a hardcoded, localized apology string without crashing the UI.

---

## 6. Architecture Canvas (Data Flow & State)

### The `AgentState` Definition (TypeScript)

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

1. **User Input:** Microphone Button pressed $\rightarrow$ `expo-av` captures audio PCM stream.
2. **Async Transcription:** PCM stream $\rightarrow$ `whisper.rn` (C++ Engine) $\rightarrow$ Returns raw English string.
3. **Graph Initialization:** UI triggers LangGraph.js execution, passing the string and `target_language`.
4. **Gatekeeper Node (LLM Sync):** State $\rightarrow$ `react-native-llama` evaluates prompt $\rightarrow$ Outputs JSON string.
5. **Validation Sync:** JSON string $\rightarrow$ `zod.parse()`. (Throws error if schema fails, triggering graph retry or fallback).
6. **Tool Execution (DB Sync):** Zod Object $\rightarrow$ `DatabaseManager` (SQLite Proxy) $\rightarrow$ Executes `SELECT json_extract(...)` or `INSERT`.
7. **Synthesis Node (LLM Async):** DB results & Context $\rightarrow$ `react-native-llama` generates final response in `target_language` $\rightarrow$ Streams back to React Native UI via channel reducer.

---

## 7. Execution Roadmap (Next Steps)

1. **Phase 6.1: Boilerplate & State Management**
* Init Expo project. Set up React Navigation (Stack + Tabs).
* Define the Zod schemas and LangGraph.js `AgentState` interface.


2. **Phase 6.2: Asset Pipeline (The Downloader)**
* Implement the `OnboardingScreen` with `expo-file-system`.
* Wire the target URLs for the Qwen models and Whisper `.bin`.
* Add file-size validation logic.


3. **Phase 6.3: Database Infrastructure**
* Implement the `DatabaseManager` proxy class.
* Initialize `expo-sqlite` and construct tables mirroring the Phase 2 DuckDB schemas (using JSON text columns).


4. **Phase 6.4: C++ Engine Integration**
* Install and configure `react-native-llama` and `whisper.rn`.
* Wire the local file paths (from Phase 6.2) into the engine initialization contexts.


5. **Phase 6.5: Graph Translation & UI Hookup**
* Port the Python `nodes.py` and `router.py` logic into standard asynchronous TypeScript functions.
* Bind the UI buttons (Scribe Mode & Chat Mode) to trigger the compiled graph.