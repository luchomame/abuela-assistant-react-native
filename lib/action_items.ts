import { z } from 'zod';

// --- Action Type Enum ---
export const ActionTypeSchema = z.enum([
  "MEDICATION",
  "FOLLOW_UP",
  "DIAGNOSTIC",
  "LIFESTYLE",
  "MONITORING",
  "TREATMENT",
  "OTHER",
]);

export type ActionType = z.infer<typeof ActionTypeSchema>;

// --- Action Payload Models ---
export const MedicationPayloadSchema = z.object({
  name: z.string(),
  purpose: z.string(),
  dosage: z.string(),
  frequency: z.string(),
});

export const FollowUpPayloadSchema = z.object({
  doctor_name: z.string(),
  specialty: z.string(),
  timeframe: z.string(),
  reason: z.string(),
  location: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});

export const DiagnosticPayloadSchema = z.object({
  test_name: z.string(),
  body_part: z.string(),
  reason: z.string(),
});

export const LifestylePayloadSchema = z.object({
  description: z.string(),
});

export const OtherPayloadSchema = z.object({
  description: z.string(),
});

export const MonitoringPayloadSchema = z.object({
  metric: z.string(),
  frequency: z.string(),
  duration: z.string(),
  instructions: z.string(),
  target_value: z.string().nullable().optional(),
});

export const TreatmentPayloadSchema = z.object({
  treatment_name: z.string(),
  provider: z.string(),
  frequency: z.string(),
  duration: z.string(),
  instructions: z.string(),
});

// --- Union & Main Entity ---
export const ActionPayloadSchema = z.discriminatedUnion("type", [
  // Note: If the LLM doesn't output a "type" field inside the payload itself, 
  // you can use a standard z.union(), but discriminated unions are safer 
  // if you can tweak the LLM prompt to include the type key in the payload.
  // For exact parity with your Python union:
  MedicationPayloadSchema,
  FollowUpPayloadSchema,
  DiagnosticPayloadSchema,
  LifestylePayloadSchema,
  MonitoringPayloadSchema,
  TreatmentPayloadSchema,
  OtherPayloadSchema,
]);

export type ActionPayload = z.infer<typeof ActionPayloadSchema>;

export const ActionItemSchema = z.object({
  action_type: ActionTypeSchema,
  // Using z.record keeps this loose enough for runtime extraction, 
  // setting you up perfectly to dump this straight into a PostgreSQL jsonb column later.
  action_description: z.record(z.string(), z.unknown()), 
});

export type ActionItem = z.infer<typeof ActionItemSchema>;