# Plan: Persistent Database Storage & UI

## Goal
Enable the app to persistently save user-entered notes (Symptoms) to the local SQLite database and display them in a list that survives app reloads.

## 1. Database Layer (lib/database/manager.ts) [DONE]
- The `daily_symptoms` table is defined in the schema.
- `insertSymptom(text)` is implemented to save new notes.
- `getAllSymptoms()` is implemented to fetch history (newest first).

## 2. Global DB Access (lib/db.ts) [RESTORED]
- Re-created the missing `lib/db.ts` file which provides a singleton `getDbManager()` helper.
- This allows all screens to share the same database connection and initialization state.

## 3. UI Implementation (app/(tabs)/explore.tsx) [DONE]
- Renamed the "Explore" tab to **"Assistant"** in `app/(tabs)/_layout.tsx`.
- Built a scrollable list (FlatList) to display symptom history.
- Added a `TextInput` and `Save` button at the bottom.
- On mount, it loads previous data from the DB.
- On "Save", it writes to the DB and refreshes the list.

## 4. Verification
- **Step 1:** Tap the "Assistant" tab (the chat bubble icon).
- **Step 2:** Type a test note (e.g., "Sore throat") and tap **Save**.
- **Step 3:** Confirm the note appears in the list.
- **Step 4:** Close the app entirely.
- **Step 5:** Re-open the app and navigate back to the "Assistant" tab.
- **Step 6:** The note should still be there.
