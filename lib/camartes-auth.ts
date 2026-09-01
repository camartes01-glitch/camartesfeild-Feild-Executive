import { CAMARTES_API } from "@/lib/camartes-api";
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

function initialsFrom(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "C") + (parts[1]?.[0] ?? "");
}

function roleFromPayload(payload: JsonRecord, fallback: UserRole): UserRole {
  const nested = asRecord(payload.user) ?? payload;
  const raw = pickString(nested.role, nested.user_role, payload.role, payload.user_role).toLowerCase();
  if (payload.is_admin === true || nested.is_admin === true) return "operations_manager";
  if (/admin|operation|manager|dispatch|hrms/.test(raw)) return "operations_manager";
  if (/field|executive|employee/.test(raw)) return "field_executive";
  return fallback;
}

export function mapCamartesProfile(payload: unknown, fallbackRole: UserRole): FieldUser | null {
  const root = asRecord(payload);
  if (!root) return null;
  const nested = asRecord(root.user) ?? asRecord(root.data) ?? root;
  const email = pickString(nested.email, root.email);
  const id = pickString(nested.id, nested.user_id, nested.employee_id, root.id, email);
  const name = pickString(nested.name, nested.full_name, nested.display_name, email.split("@")[0]);
  if (!id && !email) return null;
  return {
    id: id || email,
    name: name || email || "Camartes employee",
    email: email || `${id}@camartes.com`,
    phone: pickString(nested.phone, nested.mobile, nested.contact_number),
    employeeId: pickString(nested.employee_id, nested.employeeId, nested.emp_id) || id || "CM-FE",
    role: roleFromPayload(root, fallbackRole),
    hub: pickString(nested.hub, nested.city, nested.location) || "Hyderabad",
    avatarInitials: initialsFrom(name || email || "CM").toUpperCase(),
    employment: "Camartes employee",
    source: "camartes",
  };
}

function tokenFromPayload(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;
  const nested = asRecord(root.user) ?? asRecord(root.data) ?? root;
  return pickString(root.access_token, root.token, root.accessToken, nested.access_token, nested.token) || null;
}

async function postLogin(path: string, body: JsonRecord): Promise<{ status: number; payload: unknown }> {
  const res = await fetch(`${CAMARTES_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  return { status: res.status, payload };
}

export async function loginCamartes(email: string, password: string): Promise<
  { ok: true; session: AuthSession } | { ok: false; error: string }
> {
  const trimmed = email.trim();
  if (!trimmed || !password) return { ok: false, error: "Email and password are required." };

  try {
    const appLogin = await postLogin("/api/auth/login", { email_or_phone: trimmed, password });
    if (appLogin.status >= 200 && appLogin.status < 300) {
      const user = mapCamartesProfile(appLogin.payload, "field_executive");
      if (!user) {
        return { ok: false, error: "Camartes login succeeded but the profile is missing required fields." };
      }
      return { ok: true, session: { user, token: tokenFromPayload(appLogin.payload) } };
    }

    const adminLogin = await postLogin("/api/admin/auth/login", { email: trimmed, password });
    if (adminLogin.status >= 200 && adminLogin.status < 300) {
      const user = mapCamartesProfile(adminLogin.payload, "operations_manager");
      if (!user) {
        return { ok: false, error: "Camartes admin login succeeded but the profile is missing required fields." };
      }
      return {
        ok: true,
        session: {
          user: { ...user, role: "operations_manager" },
          token: tokenFromPayload(adminLogin.payload),
        },
      };
    }

    if (appLogin.status === 401 || adminLogin.status === 401) {
      return { ok: false, error: "Email or password is incorrect." };
    }
    return { ok: false, error: `Camartes login failed (${appLogin.status}).` };
  } catch {
    return { ok: false, error: "Cannot reach Camartes login right now." };
  }
}

export async function logoutCamartes(token: string | null) {
  if (!token) return;
  try {
    await fetch(`${CAMARTES_API}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  } catch {
    /* session is cleared locally regardless */
  }
}
