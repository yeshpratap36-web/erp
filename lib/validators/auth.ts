import { z } from "zod";

/** Human-readable rules, shown next to the new-password field. Keep in sync with passwordSchema. */
export const PASSWORD_RULES = [
  "At least 10 characters",
  "An uppercase and a lowercase letter",
  "A number",
  "A symbol (e.g. @ # $ !)",
];

export const passwordSchema = z
  .string()
  .min(10, "At least 10 characters")
  .max(128, "At most 128 characters")
  .regex(/[a-z]/, "At least one lowercase letter")
  .regex(/[A-Z]/, "At least one uppercase letter")
  .regex(/[0-9]/, "At least one number")
  .regex(/[^A-Za-z0-9]/, "At least one symbol");

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your roll number, employee ID or email").max(254),
  password: z.string().min(1, "Enter your password").max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ["newPassword"],
    message: "New password must be different from the current one",
  });
