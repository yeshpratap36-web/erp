"use client";

import { useFieldState } from "@/components/forms/form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Common = {
  name: string;
  label: string;
  /** Explicit errors; otherwise read from the enclosing <ActionForm>. */
  errors?: string[];
  hint?: React.ReactNode;
  id?: string;
};

function useFieldWiring({ name, errors, hint, id = name }: Common) {
  const fromForm = useFieldState(name);
  const fieldErrors = errors ?? fromForm.errors;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [fieldErrors?.length ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(" ");
  return {
    id,
    fieldErrors,
    submittedValue: fromForm.submittedValue,
    aria: {
      "aria-invalid": fieldErrors?.length ? true : undefined,
      "aria-describedby": describedBy || undefined,
    } as const,
    errorId,
    hintId,
  };
}

function FieldShell({
  label,
  hint,
  wiring,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  wiring: ReturnType<typeof useFieldWiring>;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={wiring.id}>{label}</Label>
      {children}
      {hint && (
        <div id={wiring.hintId} className="text-xs text-muted-foreground">
          {hint}
        </div>
      )}
      {wiring.fieldErrors?.length ? (
        <p id={wiring.errorId} className="text-sm text-destructive">
          {wiring.fieldErrors[0]}
        </p>
      ) : null}
    </div>
  );
}

/** Labelled input with accessible error/hint wiring. Restores the submitted value after an error. */
export function Field({
  name,
  label,
  errors,
  hint,
  id,
  defaultValue,
  ...inputProps
}: Common & Omit<React.ComponentProps<typeof Input>, "name" | "id">) {
  const wiring = useFieldWiring({ name, label, errors, hint, id });
  const isSecret = inputProps.type === "password";
  return (
    <FieldShell label={label} hint={hint} wiring={wiring}>
      <Input
        key={isSecret ? undefined : wiring.submittedValue}
        id={wiring.id}
        name={name}
        defaultValue={isSecret ? undefined : (wiring.submittedValue ?? defaultValue)}
        {...wiring.aria}
        {...inputProps}
      />
    </FieldShell>
  );
}

export type SelectOption = { value: string; label: string };

export function SelectField({
  name,
  label,
  errors,
  hint,
  id,
  options,
  placeholder,
  defaultValue,
  ...selectProps
}: Common & {
  options: SelectOption[];
  placeholder?: string;
} & Omit<React.ComponentProps<"select">, "name" | "id" | "size">) {
  const wiring = useFieldWiring({ name, label, errors, hint, id });
  return (
    <FieldShell label={label} hint={hint} wiring={wiring}>
      <NativeSelect
        key={wiring.submittedValue}
        id={wiring.id}
        name={name}
        className="w-full"
        defaultValue={wiring.submittedValue ?? defaultValue ?? ""}
        {...wiring.aria}
        {...selectProps}
      >
        {placeholder !== undefined && (
          <NativeSelectOption value="">{placeholder}</NativeSelectOption>
        )}
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </FieldShell>
  );
}

export function TextareaField({
  name,
  label,
  errors,
  hint,
  id,
  defaultValue,
  ...props
}: Common & Omit<React.ComponentProps<typeof Textarea>, "name" | "id">) {
  const wiring = useFieldWiring({ name, label, errors, hint, id });
  return (
    <FieldShell label={label} hint={hint} wiring={wiring}>
      <Textarea
        key={wiring.submittedValue}
        id={wiring.id}
        name={name}
        defaultValue={wiring.submittedValue ?? defaultValue}
        {...wiring.aria}
        {...props}
      />
    </FieldShell>
  );
}

/** Native checkbox (submits "on" when checked). */
export function CheckboxField({
  name,
  label,
  defaultChecked,
  hint,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  const { submittedValue } = useFieldState(name);
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={submittedValue !== undefined ? submittedValue === "on" : defaultChecked}
        className="mt-0.5 size-4 accent-primary"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}
