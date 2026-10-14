import { apiConfigStatus } from "@/lib/field-ops-config";

export type ApiOk<T> = { ok: true; status: number; body: T };
export type ApiErr = {
  ok: false;
  status: number;
  code: string;
  message: string;
  retryable: boolean;
  detail?: Record<string, unknown>;
};
export type ApiResult<T> = ApiOk<T> | ApiErr;

export function apiRoot(): string {
  return apiConfigStatus().url;
}

export function apiConfigError(): string | null {
  return apiConfigStatus().error;
}

/** Network failures, timeouts, rate limits and 5xx are worth retrying; 4xx business rejections are not. */
export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

export function parseError(status: number, payload: unknown): ApiErr {
  const detail =
    payload && typeof payload === "object" && "detail" in payload ? (payload as { detail: unknown }).detail : null;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    return {
      ok: false,
      status,
      code: String(d.code ?? `HTTP_${status}`),
      message: String(d.message ?? `Request failed (${status})`),
      retryable: isRetryableStatus(status),
      detail: d,
    };
  }
  const message = typeof detail === "string" && detail.trim() ? detail : `Request failed (${status})`;
  return { ok: false, status, code: `HTTP_${status}`, message, retryable: isRetryableStatus(status) };
}

export async function apiRequest<T>(
  path: string,
  opts: {
    method?: "GET" | "POST" | "PUT" | "PATCH";
    token?: string | null;
    body?: unknown;
    idempotencyKey?: string;
    timeoutMs?: number;
  } = {},
): Promise<ApiResult<T>> {
  const root = apiRoot();
  if (!root) {
    return { ok: false, status: 0, code: "NOT_CONFIGURED", message: "Operations API URL is not configured.", retryable: false };
  }
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(`${root}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    if (res.ok) return { ok: true, status: res.status, body: payload as T };
    return parseError(res.status, payload);
  } catch {
    return { ok: false, status: 0, code: "NETWORK", message: "No connection to Camartes Operations.", retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

/** Absolute URL for a signed media path returned by the API. */
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${apiRoot()}${url}`;
}

export const OPS = "/api/field-ops";
