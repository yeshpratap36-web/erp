import "server-only";
import type { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { SettingKey } from "@/lib/settings";
import { getSetting } from "@/lib/settings.server";
import type { GradeBandInput, settingsFormSchema } from "@/lib/validators/settings";

export async function saveSettings(input: z.output<typeof settingsFormSchema>, actorId: string) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(input) as [SettingKey, unknown][]) {
    const before = await getSetting(key);
    if (before === value) continue;
    changes[key] = { from: before, to: value };
    await db.setting.upsert({
      where: { key },
      create: { key, value: value as never, updatedById: actorId },
      update: { value: value as never, updatedById: actorId },
    });
  }
  if (Object.keys(changes).length) {
    await audit({
      actorId,
      action: "settings.updated",
      entityType: "Setting",
      metadata: changes as never,
    });
  }
  return Object.keys(changes).length;
}

/** Replace the default grade scale's bands. Published results keep their snapshot grades. */
export async function saveDefaultGradeBands(bands: GradeBandInput[], actorId: string) {
  const scale = await db.gradeScale.findFirstOrThrow({
    where: { isDefault: true },
    include: { bands: true },
  });
  await db.$transaction([
    db.gradeBand.deleteMany({ where: { gradeScaleId: scale.id } }),
    db.gradeBand.createMany({ data: bands.map((b) => ({ ...b, gradeScaleId: scale.id })) }),
  ]);
  await audit({
    actorId,
    action: "settings.updated",
    entityType: "GradeScale",
    entityId: scale.id,
    metadata: {
      from: scale.bands.map((b) => `${b.letter}≥${b.minPercent}:${b.gradePoint}`).join(" "),
      to: bands.map((b) => `${b.letter}≥${b.minPercent}:${b.gradePoint}`).join(" "),
    },
  });
}
