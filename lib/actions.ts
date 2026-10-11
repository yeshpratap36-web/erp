/** Result shape for form Server Actions used with useActionState. */
export type ActionState = {
  ok?: boolean;
  /** Form-level error, safe to display. */
  error?: string;
  /** Per-field validation errors from Zod. */
  fieldErrors?: Record<string, string[] | undefined>;
  /**
   * Non-sensitive submitted values to restore after an error (React resets uncontrolled
   * fields when a form action completes). Never echo passwords.
   */
  values?: Record<string, string>;
};

export const initialActionState: ActionState = {};
