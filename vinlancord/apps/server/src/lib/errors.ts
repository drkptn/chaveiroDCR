export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>, code = 'BAD_REQUEST') =>
  new ApiError(400, code, message, fields);
export const unauthorized = (message = 'Você precisa estar conectado.') => new ApiError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Você não tem permissão para isso.', code = 'MISSING_PERMISSIONS') =>
  new ApiError(403, code, message);
export const notFound = (what = 'Recurso') => new ApiError(404, 'NOT_FOUND', `${what} não encontrado.`);
export const conflict = (message: string, code = 'CONFLICT', fields?: Record<string, string>) =>
  new ApiError(409, code, message, fields);
export const tooMany = (message = 'Calma aí! Muitas requisições, tente de novo em instantes.') =>
  new ApiError(429, 'RATE_LIMITED', message);
export const invalidPassword = () => new ApiError(403, 'INVALID_PASSWORD', 'Senha incorreta.');
