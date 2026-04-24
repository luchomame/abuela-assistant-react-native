# Plan: Persistent Database Storage & UI

## Goal
Enable the app to persistently save user-entered notes (Symptoms) to the local SQLite database and display them in a list that survives app reloads.

## Phase 1: Core Infrastructure [✅ COMPLETED]
- **Database Layer:** `daily_symptoms` table and `insertSymptom` logic implemented.
- **Global Access:** Singleton `getDbManager()` helper restored in `lib/db.ts`.
- **UI Integration:** "Assistant" tab built with history list and persistent saving.
- **Verification:** User can save "My back hurts," reload, and see it still there.

## Phase 2: Scribe & Search Integration [NEXT]
The objective is to move from simple text notes to structured medical memory.

### 1. Structured Visit Storage
- **Logic:** Update the recording flow to use `dbManager.insertVisit()`.
- **Data:** Ensure English transcript, Spanish translation, and Action Items (meds/follow-ups) are all saved in one transaction.

### 2. Semantic Vector Wiring (The "Brain")
- **Task:** Update the save process to call `InterpretationService.embedSummary()`.
- **Storage:** Save the resulting 1024-dim vector into the `summaries_vec` table.
- **Dependency:** Requires EAS Development Build for `sqlite-vec` support.

### 3. Longitudinal Search Method
- **Method:** Implement `findRelatedVisits(queryText)` in `DatabaseManager`.
- **Flow:** Convert query to vector -> Perform cosine similarity search -> Return the most relevant past visits.

### 4. Visit History UI
- **UI:** Add a "Past Visits" section to the Assistant tab (potentially using a segmented control or toggle to switch between "Symptoms" and "Doctor Visits").
