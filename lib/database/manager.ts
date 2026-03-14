/**
 * manager.ts — DatabaseManager for the Abuela Assistant (React Native).
 *
 * Port of the Python DatabaseManager (database/manager.py).
 * Wraps expo-sqlite async API and uses sqlite-vec for vector search.
 *
 * IMPORTANT: Call `initialize()` once before using any other method.
 * The caller is responsible for opening the database and passing it in.
 */

import * as SQLite from 'expo-sqlite';

import type { ActionItem, ActionType } from '@/lib/action_items';
import type { SemanticResults, Translation, VisitSummary } from '@/lib/core_models';

// ---------------------------------------------------------------------------
// Schema SQL — loaded as a string constant since RN can't read files at runtime
// ---------------------------------------------------------------------------
const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    user_name TEXT NOT NULL,
    preferred_language TEXT NOT NULL DEFAULT 'Spanish',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS summaries (
    summary_id INTEGER PRIMARY KEY AUTOINCREMENT,
    english_transcript TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS summaries_vec USING vec0(
    summary_id INTEGER PRIMARY KEY,
    summary_vector FLOAT[1024]
);

CREATE TABLE IF NOT EXISTS translations (
    translation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    summary_id INTEGER NOT NULL REFERENCES summaries(summary_id),
    translated_language TEXT NOT NULL,
    translated_text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS action_items (
    action_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    summary_id INTEGER NOT NULL REFERENCES summaries(summary_id),
    action_type TEXT NOT NULL,
    action_description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_symptoms (
    symptom_id INTEGER PRIMARY KEY AUTOINCREMENT,
    symptom_description TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// ---------------------------------------------------------------------------
// Types for internal row shapes returned by getAllAsync
// ---------------------------------------------------------------------------
interface SummaryRow {
  summary_id: number;
  english_transcript: string;
}

interface ActionItemRow {
  action_type: string;
  action_description: string;
}

interface VecSearchRow {
  summary_id: number;
  distance: number;
}

interface UserProfileRow {
  user_name: string;
  preferred_language: string;
}

// ---------------------------------------------------------------------------
// DatabaseManager
// ---------------------------------------------------------------------------
export class DatabaseManager {
  private db: SQLite.SQLiteDatabase;

  constructor(db: SQLite.SQLiteDatabase) {
    this.db = db;
  }

  // ==================== INITIALIZATION ====================

  /**
   * Creates all tables and loads the sqlite-vec extension.
   * Must be called once after constructing the manager.
   */
  async initialize(): Promise<void> {
    try {
      await this.db.execAsync(SCHEMA_SQL);
      console.log('[DatabaseManager] Schema initialized');
    } catch (error) {
      console.error('[DatabaseManager] Schema initialization failed:', error);
      throw error;
    }
  }

  // ==================== VISIT OPERATIONS ====================

  /**
   * Inserts a complete visit record (summary + action items + translation)
   * inside a single transaction. Mirrors Python's insert_visit().
   *
   * @param summary  - The visit transcript and its embedding vector
   * @param actionItems - Extracted action items (medications, follow-ups, etc.)
   * @param translation - The Spanish translation of the summary
   */
  async insertVisit(
    summary: VisitSummary,
    actionItems: ActionItem[],
    translation: Translation,
  ): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      // 1. Insert the summary text
      const summaryResult = await this.db.runAsync(
        'INSERT INTO summaries (english_transcript) VALUES (?)',
        summary.english_transcript,
      );
      const summaryId = summaryResult.lastInsertRowId;

      // 2. Insert the embedding vector into the vec0 virtual table
      if (summary.summary_vector && summary.summary_vector.length === 1024) {
        const vectorJson = JSON.stringify(summary.summary_vector);
        await this.db.runAsync(
          'INSERT INTO summaries_vec (summary_id, summary_vector) VALUES (?, ?)',
          summaryId,
          vectorJson,
        );
      }

      // 3. Insert action items (if any)
      for (const item of actionItems) {
        const descriptionJson =
          typeof item.action_description === 'string'
            ? item.action_description
            : JSON.stringify(item.action_description);
        await this.db.runAsync(
          'INSERT INTO action_items (summary_id, action_type, action_description) VALUES (?, ?, ?)',
          summaryId,
          item.action_type,
          descriptionJson,
        );
      }

      // 4. Insert translation
      if (translation) {
        await this.db.runAsync(
          'INSERT INTO translations (summary_id, translated_language, translated_text) VALUES (?, ?, ?)',
          summaryId,
          translation.translated_language,
          translation.translated_text,
        );
      }

      console.log('[DatabaseManager] Visit inserted, summary_id:', summaryId);
    });
  }

  // ==================== SYMPTOM OPERATIONS ====================

  /**
   * Logs a symptom to the daily_symptoms table.
   * Mirrors Python's insert_symptom().
   *
   * @returns The new symptom's ID as a string
   */
  async insertSymptom(symptomDescription: string): Promise<string> {
    const result = await this.db.runAsync(
      'INSERT INTO daily_symptoms (symptom_description) VALUES (?)',
      symptomDescription,
    );
    const symptomId = String(result.lastInsertRowId);
    console.log('[DatabaseManager] Symptom logged, id:', symptomId);
    return symptomId;
  }

  // ==================== ACTION ITEM QUERIES ====================

  /**
   * Queries action items by type and optional condition text.
   * Mirrors Python's query_action_items().
   *
   * Uses LIKE for condition matching (SQLite doesn't have ILIKE,
   * but LIKE is case-insensitive for ASCII by default).
   */
  async queryActionItems(
    actionType: ActionType,
    targetCondition?: string,
  ): Promise<ActionItem[]> {
    let rows: ActionItemRow[];

    if (targetCondition) {
      const wildcard = `%${targetCondition}%`;
      rows = await this.db.getAllAsync<ActionItemRow>(
        `SELECT action_type, action_description
         FROM action_items
         WHERE action_type = ?
         AND action_description LIKE ?`,
        actionType,
        wildcard,
      );
    } else {
      rows = await this.db.getAllAsync<ActionItemRow>(
        `SELECT action_type, action_description
         FROM action_items
         WHERE action_type = ?`,
        actionType,
      );
    }

    return rows.map((row) => ({
      action_type: row.action_type as ActionType,
      action_description: this.parseJsonSafe(row.action_description),
    }));
  }

  /**
   * Returns all action items for a given type (simpler query).
   * Mirrors Python's get_action_items().
   */
  async getActionItems(actionType: ActionType): Promise<ActionItem[]> {
    const rows = await this.db.getAllAsync<ActionItemRow>(
      `SELECT action_type, action_description
       FROM action_items
       WHERE action_type = ?`,
      actionType,
    );

    return rows.map((row) => ({
      action_type: row.action_type as ActionType,
      action_description: this.parseJsonSafe(row.action_description),
    }));
  }

  // ==================== SEMANTIC SEARCH ====================

  /**
   * Performs cosine similarity search against stored visit embeddings
   * using sqlite-vec's vec_distance_cosine().
   * Mirrors Python's semantic_search().
   *
   * @param queryVector - 1024-dim float array from the embedding model
   * @param topK        - Max number of results (default: 3)
   * @param threshold   - Minimum similarity score (default: 0.65)
   *
   * NOTE: sqlite-vec returns a *distance* (lower = more similar).
   *       Cosine distance = 1 - cosine_similarity.
   *       We convert: similarity = 1 - distance, then filter by threshold.
   */
  async semanticSearch(
    queryVector: number[],
    topK: number = 3,
    threshold: number = 0.65,
  ): Promise<SemanticResults[]> {
    const vectorJson = JSON.stringify(queryVector);
    const distanceThreshold = 1 - threshold; // Convert similarity threshold to distance

    // Step 1: Query the vec0 table for nearest neighbors
    const vecRows = await this.db.getAllAsync<VecSearchRow>(
      `SELECT summary_id, distance
       FROM summaries_vec
       WHERE summary_vector MATCH ?
       AND k = ?`,
      vectorJson,
      topK,
    );

    // Step 2: Filter by threshold and fetch the actual transcript text
    const results: SemanticResults[] = [];
    for (const vecRow of vecRows) {
      if (vecRow.distance > distanceThreshold) continue;

      const summaryRow = await this.db.getFirstAsync<SummaryRow>(
        'SELECT summary_id, english_transcript FROM summaries WHERE summary_id = ?',
        vecRow.summary_id,
      );

      if (summaryRow) {
        results.push({
          summary_id: String(summaryRow.summary_id),
          english_transcript: summaryRow.english_transcript,
          similarity_score: 1 - vecRow.distance, // Convert back to similarity
        });
      }
    }

    return results;
  }

  // ==================== USER PROFILE ====================

  /**
   * Retrieves the user profile (singleton row).
   * Returns null if onboarding hasn't been completed yet.
   */
  async getUserProfile(): Promise<UserProfileRow | null> {
    return await this.db.getFirstAsync<UserProfileRow>(
      'SELECT user_name, preferred_language FROM user_profile WHERE id = 1',
    );
  }

  /**
   * Creates or updates the user profile (upsert).
   * Called during onboarding to save the user's name and language preference.
   */
  async saveUserProfile(userName: string, preferredLanguage: string): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO user_profile (id, user_name, preferred_language)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_name = excluded.user_name,
         preferred_language = excluded.preferred_language`,
      userName,
      preferredLanguage,
    );
    console.log('[DatabaseManager] User profile saved');
  }

  // ==================== CLEANUP ====================

  /**
   * Closes the database connection gracefully.
   */
  async close(): Promise<void> {
    try {
      await this.db.closeAsync();
      console.log('[DatabaseManager] Database connection closed');
    } catch (error) {
      console.error('[DatabaseManager] Error closing database:', error);
    }
  }

  // ==================== HELPERS ====================

  /**
   * Safely parses a JSON string, returning the raw string as a
   * { raw: string } object if parsing fails.
   */
  private parseJsonSafe(jsonString: string): Record<string, unknown> {
    try {
      return JSON.parse(jsonString) as Record<string, unknown>;
    } catch {
      return { raw: jsonString };
    }
  }
}
