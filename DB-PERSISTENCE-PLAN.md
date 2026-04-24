# Plan: Database Persistence & UI Integration

## Objective
Implement a persistent "Symptom Log" in the Chat tab to verify that the SQLite database is correctly saving, storing, and retrieving data across application reloads.

## Key Files
- `app/(tabs)/explore.tsx`: To be transformed into the "Symptom Log / Chat" screen.
- `lib/database/manager.ts`: Uses the `daily_symptoms` table and `insertSymptom` method.

## Detailed Implementation Steps

### 1. Transform the "Explore" Tab into "Symptom Log"
We will update `app/(tabs)/explore.tsx` to provide a simple, clean interface for interacting with the database.

**UI Components:**
- **Header:** "Symptom History" or "My Notes".
- **List View:** A `FlatList` or `ScrollView` that displays all entries from the `daily_symptoms` table, showing the date and the text.
- **Input Area:** A `TextInput` at the bottom with a "Save" button.

### 2. Database Retrieval Logic
On the component's `useEffect` (mount), we will:
1.  Access the `dbManager`.
2.  Execute a query to fetch all rows from `daily_symptoms` (ordered by `created_at DESC`).
3.  Store these in a local `notes` state variable.

### 3. Database Save Logic
When the user types a note and taps "Save":
1.  Call `dbManager.insertSymptom(text)`.
2.  Clear the input field.
3.  Refresh the list by re-fetching from the database (or optimistically updating the state).

### 4. Verification of Persistence
- **Action:** Open the app, go to the second tab, write "My back hurts," and tap Save.
- **Action:** Close the app completely (kill the process).
- **Action:** Re-open the app.
- **Expectation:** "My back hurts" should be visible in the history list immediately upon loading.

## Future Extension
Once this simple persistence is confirmed, we will wire this input into the **LangGraph Agent**, allowing the LLM to decide whether a message is a symptom to be logged or a question to be answered via semantic search.
