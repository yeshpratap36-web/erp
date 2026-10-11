import { z } from "zod";
import { SessionType } from "@/generated/prisma/enums";
import { parseHHMM } from "@/lib/time";
import { dateField, idField, optionalText } from "@/lib/validators/common";

const timeField = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const minutes = parseHHMM(v);
      if (minutes === null) {
        ctx.addIssue({ code: "custom", message: `${label} must be a time like 09:30` });
        return z.NEVER;
      }
      return minutes;
    });

const timeRange = <T extends { startMinute: number; endMinute: number }>(schema: z.ZodType<T>) =>
  schema
    .refine((d) => d.startMinute < d.endMinute, {
      path: ["endMinute"],
      message: "End time must be after the start",
    })
    .refine((d) => d.endMinute - d.startMinute <= 4 * 60, {
      path: ["endMinute"],
      message: "A class can be at most 4 hours long",
    });

/** Weekly slot. The assignment fixes section + course + faculty in one consistent choice. */
export const slotSchema = timeRange(
  z.object({
    assignmentId: idField("Course"),
    roomId: idField("Room"),
    dayOfWeek: z.coerce.number().int().min(1, "Choose a day").max(7, "Choose a day"),
    startMinute: timeField("Start time"),
    endMinute: timeField("End time"),
    type: z.enum(SessionType),
  }),
);

export const extraClassSchema = timeRange(
  z.object({
    assignmentId: idField("Course"),
    roomId: idField("Room"),
    date: dateField("Date"),
    startMinute: timeField("Start time"),
    endMinute: timeField("End time"),
  }),
);

export const cancelClassSchema = z.object({
  slotId: idField("Class"),
  date: dateField("Date"),
  reason: optionalText(200),
});

export const sessionIdSchema = z.object({ sessionId: idField("Class") });
export const slotIdSchema = z.object({ slotId: idField("Slot") });
