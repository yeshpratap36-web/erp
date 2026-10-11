"use server";

import { z } from "zod";
import { formAction } from "@/lib/actions.server";
import { saveDefaultGradeBands, saveSettings } from "@/lib/services/settings-admin";
import { parseGradeBands, settingsFormSchema } from "@/lib/validators/settings";

export const saveSettingsAction = formAction(
  { permission: "settings:manage", schema: settingsFormSchema },
  async (input, admin) => {
    const changed = await saveSettings(input, admin.id);
    return {
      ok: true,
      message: changed ? `Saved ${changed} setting${changed === 1 ? "" : "s"}` : "No changes",
    };
  },
);

export const saveGradeBandsAction = formAction(
  { permission: "settings:manage", schema: z.record(z.string(), z.string()) },
  async (fields, admin) => {
    const { bands, errors } = parseGradeBands(fields);
    if (errors.length) return { error: errors.join(". ") + "." };
    await saveDefaultGradeBands(bands, admin.id);
    return { ok: true, message: "Grade scale saved. Already-published grades are unchanged." };
  },
);
