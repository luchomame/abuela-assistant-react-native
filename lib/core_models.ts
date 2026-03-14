import { z } from 'zod';

export const TranslationSchema = z.object({
  translated_language: z.string(),
  translated_text: z.string(),
});

export type Translation = z.infer<typeof TranslationSchema>;

export const VisitSummarySchema = z.object({
  english_transcript: z.string(),
  // Default: a 1024-dim zero vector (matches qwen3-embedding)
  summary_vector: z.array(z.number()).default(() => Array(1024).fill(0.0)),
  summary_id: z.string().nullable().optional(),
});

export type VisitSummary = z.infer<typeof VisitSummarySchema>;

export const SemanticResultsSchema = z.object({
  summary_id: z.string(),
  english_transcript: z.string(),
  similarity_score: z.number(),
});

export type SemanticResults = z.infer<typeof SemanticResultsSchema>;