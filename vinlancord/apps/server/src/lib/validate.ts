import { z, type ZodType } from 'zod';
import { LIMITS, USERNAME_REGEX, HEX_COLOR_REGEX, isSnowflake } from '@vinlancord/shared';
import { badRequest } from './errors';

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data === undefined ? {} : data);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const k = issue.path.join('.') || '_';
    if (!fields[k]) fields[k] = issue.message;
  }
  throw badRequest('Dados inválidos.', fields, 'VALIDATION');
}

export const zId = z.string().refine((v) => isSnowflake(v), 'ID inválido');
export const zUsername = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_REGEX, 'Use 2 a 32 caracteres: letras minúsculas, números, "_" ou "."')
  .refine((v) => !/\.\./.test(v), 'Não use dois pontos seguidos');
export const zPassword = z
  .string()
  .min(LIMITS.PASSWORD_MIN, `A senha precisa ter pelo menos ${LIMITS.PASSWORD_MIN} caracteres`)
  .max(LIMITS.PASSWORD_MAX, 'Senha longa demais');
export const zEmail = z.string().trim().toLowerCase().email('E-mail inválido').max(254);
export const zDisplayName = z
  .string()
  .trim()
  .min(1, 'Informe um nome')
  .max(LIMITS.DISPLAY_NAME_MAX, `Máximo de ${LIMITS.DISPLAY_NAME_MAX} caracteres`)
  .refine((v) => !/[\u0000-\u001f​-‏‪-‮]/.test(v), 'Caracteres inválidos');
export const zColor = z.string().regex(HEX_COLOR_REGEX, 'Cor inválida');
export const zHttpUrl = z
  .string()
  .trim()
  .url('URL inválida')
  .max(512)
  .refine((u) => /^https?:\/\//i.test(u), 'Use um link http(s)');
