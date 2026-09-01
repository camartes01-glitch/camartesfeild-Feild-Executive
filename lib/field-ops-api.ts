import { FIELD_OPS_API, fieldOpsApiBaseUrl } from "@/lib/field-ops-config";
import { mapExpense, mapLeave, mapPrincipal, mapShift, mapTask } from "@/lib/field-ops-map";
import type {
  ExpenseClaim,
  FieldOpsMutation,
  FieldTask,
  FieldUser,
  LeaveRequest,
  OfflineItem,
  Shift,
} from "@/lib/types";

export const FIELD_OPS_HEALTH = "/api/field-ops/health";

export type FieldOpsSyncResult =
  | { ok: true; status: number; body?: unknown }
  | { ok: false; status: number; error: string; retryable: boolean };

export type FieldOpsSnapshot = {
  principal: FieldUser | null;
  tasks: FieldTask[];
  shifts: Shift[];
  leave_requests: LeaveRequest[];
  expenses: ExpenseClaim[];
  scoped_team: FieldUser[];
};

let cachedAvailability: { at: number; available: boolean; reason: string } | null = null;

export function clearFieldOpsProbeCache() {
  cachedAvailability = null;
}

function apiRoot() {
  return fieldOpsApiBaseUrl() || FIELD_OPS_API;
}

export function fieldOpsConfigured(): boolean {
  return !!apiRoot();
}

function retryableStatus(status: number) {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

function detailFromBody(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function probeFieldOps(): Promise<{ available: boolean; reason: string }> {
  if (cachedAvailability && Date.now() - cachedAvailability.at < 30_000) {
    return cachedAvailability;
  }
  const root = apiRoot();
  if (!root) {
    const result = {
      at: Date.now(),
      available: false,
      reason: "Field Operations API URL is not configured (set EXPO_PUBLIC_FIELD_OPS_API).",
    };
    cachedAvailability = result;
    return result;
  }
  try {
    const res = await fetch(`${root}${FIELD_OPS_HEALTH}`);
    const available = res.ok;
    const result = {
      at: Date.now(),
      available,
      reason: available ? "ok" : `Field Operations health returned ${res.status}`,
    };
    cachedAvailability = result;
    return result;
  } catch {
    const result = { at: Date.now(), available: false, reason: "Field Operations API unreachable" };
    cachedAvailability = result;
    return result;
  }
}

function pathFor(op: FieldOpsMutation): string {
  switch (op.type) {
    case "create_task":
      return "/api/field-ops/tasks";
    case "assign_task":
      return `/api/field-ops/tasks/${op.payload.taskId}/assign`;
    case "set_task_status":
      return `/api/field-ops/tasks/${op.payload.taskId}`;
    case "clock_in":
      return "/api/field-ops/shifts/clock-in";
    case "clock_out":
      return "/api/field-ops/shifts/clock-out";
    case "request_leave":
      return "/api/field-ops/leave";
    case "review_leave":
      return `/api/field-ops/leave/${op.payload.id}/review`;
    case "add_expense":
      return "/api/field-ops/expenses";
    case "review_expense":
      return `/api/field-ops/expenses/${op.payload.id}/review`;
  }
}

export async function fieldOpsRequest(
  path: string,
  init: RequestInit & { token?: string | null },
): Promise<{ ok: true; status: number; body: unknown } | FieldOpsSyncResult> {
  const root = apiRoot();
  if (!root) {
    return {
      ok: false,
      status: 0,
      error: "Field Operations API URL is not configured.",
      retryable: false,
    };
  }
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  try {
    const res = await fetch(`${root}${path}`, { ...init, headers });
    const body = await readJson(res);
    if (res.ok) return { ok: true, status: res.status, body };
    return {
      ok: false,
      status: res.status,
      error: detailFromBody(body, `Field Operations ${res.status}`),
      retryable: retryableStatus(res.status),
    };
  } catch {
    return { ok: false, status: 0, error: "Network error contacting Field Operations.", retryable: true };
  }
}

export async function fetchFieldOpsMe(token: string) {
  return fieldOpsRequest("/api/auth/me", { method: "GET", token });
}

export async function fetchFieldOpsSnapshot(token: string) {
  return fieldOpsRequest("/api/field-ops/snapshot", { method: "GET", token });
}

export async function fetchFieldOpsTeam(token: string) {
  return fieldOpsRequest("/api/field-ops/team", { method: "GET", token });
}

export function parseSnapshot(body: unknown, previous?: {
  tasks: FieldTask[];
  shifts: Shift[];
}): FieldOpsSnapshot {
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const prevTasks = new Map((previous?.tasks ?? []).map((row) => [row.id, row]));
  const prevShifts = new Map((previous?.shifts ?? []).map((row) => [row.id, row]));
  const teamRaw = Array.isArray(root.scoped_team) ? root.scoped_team : [];
  return {
    principal: mapPrincipal(root.principal),
    tasks: Array.isArray(root.tasks)
      ? root.tasks.map((row) => {
          const id = row && typeof row === "object" && "id" in row ? String((row as { id?: unknown }).id ?? "") : "";
          return mapTask(row, prevTasks.get(id));
        })
      : [],
    shifts: Array.isArray(root.shifts)
      ? root.shifts.map((row) => {
          const id = row && typeof row === "object" && "id" in row ? String((row as { id?: unknown }).id ?? "") : "";
          return mapShift(row, prevShifts.get(id));
        })
      : [],
    leave_requests: Array.isArray(root.leave_requests) ? root.leave_requests.map(mapLeave) : [],
    expenses: Array.isArray(root.expenses) ? root.expenses.map(mapExpense) : [],
    scoped_team: teamRaw.map(mapPrincipal).filter((row): row is FieldUser => !!row),
  };
}

export function parseTeam(body: unknown): FieldUser[] {
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rows = Array.isArray(root.team) ? root.team : [];
  return rows.map(mapPrincipal).filter((row): row is FieldUser => !!row);
}

export async function pushFieldOpsMutation(
  item: OfflineItem,
  token: string | null,
): Promise<FieldOpsSyncResult> {
  if (!item.op) {
    return { ok: false, status: 0, error: "Queue item has no mutation payload.", retryable: false };
  }
  const probe = await probeFieldOps();
  if (!probe.available) {
    return { ok: false, status: 0, error: probe.reason, retryable: true };
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": item.idempotencyKey,
  };
  const result = await fieldOpsRequest(pathFor(item.op), {
    method: item.op.type === "set_task_status" ? "PATCH" : "POST",
    headers,
    body: JSON.stringify(item.op.payload),
    token,
  });
  if (result.ok) return { ok: true, status: result.status, body: result.body };
  return result;
}
