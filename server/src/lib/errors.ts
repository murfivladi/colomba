export class HttpError extends Error {
  constructor(public status: number, public code: string, public details?: unknown) {
    super(code);
  }
}
export const bad = (code: string, details?: unknown) => new HttpError(400, code, details);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const notFound = (code = 'not_found') => new HttpError(404, code);
export const conflict = (code: string, details?: unknown) => new HttpError(409, code, details);
