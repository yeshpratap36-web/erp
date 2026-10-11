"use server";

import { formAction } from "@/lib/actions.server";
import { createSlot, deleteSlot } from "@/lib/services/timetable";
import { slotIdSchema, slotSchema } from "@/lib/validators/timetable";

const manage = { permission: "timetable:manage" } as const;

export const createSlotAction = formAction({ ...manage, schema: slotSchema }, async (input) => {
  await createSlot(input);
  return { ok: true, message: "Slot added" };
});

export const deleteSlotAction = formAction(
  { ...manage, schema: slotIdSchema },
  async ({ slotId }) => {
    await deleteSlot(slotId);
    return { ok: true };
  },
);
