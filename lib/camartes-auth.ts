import { fieldOpsApiBaseUrl } from "@/lib/field-ops-config";
import { mapPrincipal } from "@/lib/field-ops-map";
import type { AuthSession, FieldUser, UserRole } from "@/lib/types";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function exactRole(payload: JsonRecord): UserRole | null {
  const nested = asRecord(payload.user) ?? asRecord(payload.principal) ?? payload;
  const raw = pickString(nested.role, payload.role);
  if (raw === "operations_manager" || raw === "field_executive") return raw;
  return null;
}

export function mapFieldOpsProfile(payload: unknown): FieldUser | null {
  const root = asRecord(payload);
  if (!root) return null;
  const nested = asRecord(root.user) ?? asRecord(root.principal) ?? asRecord(root.data) ?? root;
  const mapped = mapPrincipal({
    ...nested,
    role: exactRole(root) ?? nested.role,
    displayName: pickString(nested.name, nested.display_name, nested.full_name, nested.displayName),
    emailOrPhone: pickString(nested.email, nested.emailOrPhone, root.email),
    employeeId: pickString(nested.employee_id, nested.employeeId, nested.emp_id),
    id: pickString(nested.id, nested.user_id, root.id),
  });
  return mapped;
}

function tokenFromPayload(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;
  const nested = asRecord(root.user) ?? asRecord(root.data) ?? root;
  return pickString(root.access_token, root.token, root.accessToken, nested.access_token, nested.token) || null;
}

async function parseResponse(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function apiRoot() {
  return fieldOpsApiBaseUrl();
}

export async function loginFieldOps(email: string, password: string): Promise<
  { ok: true; session: AuthSession } | { ok: false; error: string; status?: number }
> {
  const trimmed = email.trim();
  if (!trimmed || !password) return { ok: false, error: "Email and password are required." };
  const root = apiRoot();
  if (!root) {
    return { ok: false, error: "Field Operations API URL is not configured." };
  }

  try {
    const res = await fetch(`${root}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_or_phone: trimmed, password }),
    });
    const payload = await parseResponse(res);
    if (res.status === 401) return { ok: false, error: "Email or password is incorrect.", status: 401 };
    if (res.status === 403) {
      const detail =
        payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string"
          ? payload.detail
          : "This account is not authorized for Field Operations.";
      return { ok: false, error: detail, status: 403 };
    }
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: `Field Operations login failed (${res.status}).`, status: res.status };
    }
    const user = mapFieldOpsProfile(payload);
    const token = tokenFromPayload(payload);
    if (!user || !token) {
      return { ok: false, error: "Login succeeded but the Field Operations profile is incomplete." };
    }
    return { ok: true, session: { user, token } };
  } catch {
    return { ok: false, error: "Cannot reach the Field Operations backend right now." };
  }
}

export async function restoreFieldOpsSession(token: string): Promise<
  { ok: true; user: FieldUser } | { ok: false; status: number; error: string }
> {
  const root = apiRoot();
  if (!root) return { ok: false, status: 0, error: "Field Operations API URL is not configured." };
  try {
    const res = await fetch(`${root}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await parseResponse(res);
    if (res.status === 401) return { ok: false, status: 401, error: "Session expired." };
    if (res.status === 403) return { ok: false, status: 403, error: "Not authorized for Field Operations." };
    if (!res.ok) return { ok: false, status: res.status, error: `Session lookup failed (${res.status}).` };
    const user = mapFieldOpsProfile(payload);
    if (!user) return { ok: false, status: 422, error: "Session profile is incomplete." };
    return { ok: true, user };
  } catch {
    return { ok: false, status: 0, error: "Cannot reach the Field Operations backend right now." };
  }
}

export async function logoutFieldOps(token: string | null) {
  if (!token) return;
  const root = apiRoot();
  if (!root) return;
  try {
    await fetch(`${root}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  } catch {
    /* local session is cleared regardless */
  }
}
