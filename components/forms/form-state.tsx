"use client";

import { createContext, use } from "react";
import type { ActionState } from "@/lib/actions";

/** State of the nearest <ActionForm>, so fields can show their own errors. */
export const FormStateContext = createContext<ActionState<unknown>>({});

export function useFieldState(name: string) {
  const state = use(FormStateContext);
  return { errors: state.fieldErrors?.[name], submittedValue: state.values?.[name] };
}
