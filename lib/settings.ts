import { z } from "zod";

/**
 * Typed registry of institution-wide settings stored in the `Setting` table.
 * Each key has a Zod schema and a default; reads fall back to the default.
 */
export const settingSchemas = {
  "attendance.threshold": z.number().min(0).max(100),
  /** Cosine similarity at/above which a face is auto-matched. */
  "face.matchThreshold": z.number().min(0).max(1),
  /** Cosine similarity at/above which a face is shown as an "uncertain" candidate. */
  "face.uncertainThreshold": z.number().min(0).max(1),
  "face.deleteRawPhotosAfterEnrollment": z.boolean(),
  "auth.maxFailedAttempts": z.number().int().min(3).max(20),
  "auth.lockoutMinutes": z.number().int().min(1).max(1440),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingSchemas)[K]>;

export const settingDefaults: { [K in SettingKey]: SettingValue<K> } = {
  "attendance.threshold": 75,
  "face.matchThreshold": 0.45,
  "face.uncertainThreshold": 0.35,
  "face.deleteRawPhotosAfterEnrollment": false,
  "auth.maxFailedAttempts": 5,
  "auth.lockoutMinutes": 15,
};
