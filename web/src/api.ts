/** Клиент API: браузер обращается только к vladinc.ru/colomba/api. */
export const API_BASE = `${import.meta.env.BASE_URL}api`;

export class ApiError extends Error {
  constructor(public status: number, public code: string, public details?: any) {
    super(code);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    credentials: 'include',
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.details);
  return data as T;
}

export const mediaUrl = (id: number) => `${API_BASE}/media/${id}`;
