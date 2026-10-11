"use client";

import { useFieldState } from "@/components/forms/form-state";
import { Input } from "@/components/ui/input";

/**
 * An unlabeled input inside an <ActionForm> table (label via aria-label) that, like
 * <Field>, restores what was submitted when the action returns an error.
 */
export function BareInput({
  name,
  defaultValue,
  ...props
}: React.ComponentProps<typeof Input> & { name: string }) {
  const { submittedValue } = useFieldState(name);
  return (
    <Input
      key={submittedValue}
      name={name}
      defaultValue={submittedValue ?? defaultValue}
      {...props}
    />
  );
}

export function BareCheckbox({
  name,
  defaultChecked,
  ...props
}: React.ComponentProps<"input"> & { name: string }) {
  const { submittedValue, submitted } = useFieldState(name);
  // Unchecked boxes aren't submitted; after a submission, absence means "unchecked".
  return (
    <input
      type="checkbox"
      name={name}
      defaultChecked={submitted ? submittedValue === "on" : defaultChecked}
      className="size-4 accent-primary"
      {...props}
    />
  );
}
