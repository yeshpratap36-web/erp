import "server-only";
import { db } from "@/lib/db";
import {
  settingDefaults,
  settingSchemas,
  type SettingKey,
  type SettingValue,
} from "@/lib/settings";

/** Read a setting, falling back to its default if missing or invalid. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return settingDefaults[key];
  const parsed = settingSchemas[key].safeParse(row.value);
  if (!parsed.success) {
    console.error(`Invalid value for setting "${key}" — using default`);
    return settingDefaults[key];
  }
  return parsed.data as SettingValue<K>;
}
