// ─────────────────────────────────────────────────────────────
// Auth Validation — Zod schemas for login/register forms.
// Ensures strong passwords, valid emails, and clean usernames
// before any request reaches Supabase Auth.
// ─────────────────────────────────────────────────────────────

import { z } from "zod"

// ── Login Schema ─────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "E-mail é obrigatório")
    .email("E-mail inválido"),
  password: z
    .string()
    .min(1, "Senha é obrigatória"),
})

export type LoginInput = z.infer<typeof loginSchema>

// ── Register Schema ──────────────────────────────────────────

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(20, "Máximo 20 caracteres")
    .regex(/^[a-zA-Z0-9_]+$/, "Apenas letras, números e underscore"),
  email: z
    .string()
    .min(1, "E-mail é obrigatório")
    .email("E-mail inválido"),
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .regex(/[A-Z]/, "Deve conter pelo menos uma letra maiúscula")
    .regex(/[a-z]/, "Deve conter pelo menos uma letra minúscula")
    .regex(/[0-9]/, "Deve conter pelo menos um número")
    .regex(/[^A-Za-z0-9]/, "Deve conter pelo menos um caractere especial"),
  confirmPassword: z
    .string()
    .min(1, "Confirmação de senha é obrigatória"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
})

export type RegisterInput = z.infer<typeof registerSchema>

// ── Validation helper (same pattern as order-schema) ─────────

export interface AuthValidationResult<T> {
  success: boolean
  data?: T
  errors?: Record<string, string>
}

export function validateLogin(input: unknown): AuthValidationResult<LoginInput> {
  const result = loginSchema.safeParse(input)
  if (result.success) return { success: true, data: result.data }
  return { success: false, errors: flattenErrors(result.error) }
}

export function validateRegister(input: unknown): AuthValidationResult<RegisterInput> {
  const result = registerSchema.safeParse(input)
  if (result.success) return { success: true, data: result.data }
  return { success: false, errors: flattenErrors(result.error) }
}

function flattenErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join(".")
    if (!errors[path]) {
      errors[path] = issue.message
    }
  }
  return errors
}
