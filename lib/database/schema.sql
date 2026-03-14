-- ============================================================
-- Abuela Assistant — SQLite Schema (expo-sqlite + sqlite-vec)
--
-- Mirrors the DuckDB schema from the Python version, adapted
-- for SQLite types and sqlite-vec virtual tables.
-- ============================================================

-- Enable WAL mode for better concurrent read/write performance
PRAGMA journal_mode = WAL;

-- -----------------------------------------------------------
-- User Profile (created during onboarding)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),   -- Singleton row
    user_name TEXT NOT NULL,
    preferred_language TEXT NOT NULL DEFAULT 'Spanish',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------
-- Visit Summaries
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS summaries (
    summary_id INTEGER PRIMARY KEY AUTOINCREMENT,
    english_transcript TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------
-- Vector table for semantic search (sqlite-vec)
-- Stores 1024-dim float32 embeddings linked to summaries.
-- -----------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS summaries_vec USING vec0(
    summary_id INTEGER PRIMARY KEY,
    summary_vector FLOAT[1024]
);

-- -----------------------------------------------------------
-- Translations (one per summary, in the user's language)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS translations (
    translation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    summary_id INTEGER NOT NULL REFERENCES summaries(summary_id),
    translated_language TEXT NOT NULL,
    translated_text TEXT NOT NULL
);

-- -----------------------------------------------------------
-- Action Items (medications, follow-ups, diagnostics, etc.)
-- action_description is stored as a JSON text string for
-- future PostgreSQL/Supabase jsonb compatibility.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS action_items (
    action_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    summary_id INTEGER NOT NULL REFERENCES summaries(summary_id),
    action_type TEXT NOT NULL,
    action_description TEXT NOT NULL   -- JSON string
);

-- -----------------------------------------------------------
-- Daily Symptoms (logged by the patient via chat)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_symptoms (
    symptom_id INTEGER PRIMARY KEY AUTOINCREMENT,
    symptom_description TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
