/**
 * Клиент API. В продакшне — https://colomba-api.vladinc.ru:5576/api (задаётся при сборке
 * через VITE_API_URL); в разработке — /colomba/api через прокси Vite.
 */
export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || `${import.meta.env.BASE_URL}api`;

export class ApiError extends Error {
  constructor(public status: number, public code: string, public details?: any) {
    super(code);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
      credentials: 'include',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // не JSON: страница ошибки хостинга (таймаут PHP, защита сервера и т. п.)
    console.error(`API ${path}: HTTP ${res.status}`, text.slice(0, 500));
    throw new ApiError(res.status, res.status === 504 || res.status === 524 ? 'timeout' : 'bad_response', { status: res.status, snippet: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) });
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `http_${res.status}`, data?.details);
  return data as T;
}

export const mediaUrl = (id: number) => `${API_BASE}/media/${id}`;
