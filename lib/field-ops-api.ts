import { CAMARTES_API } from "@/lib/camartes-api";
import type { FieldOpsMutation, OfflineItem } from "@/lib/types";

/**
 * Field operations tables do not exist on camartes-backend today.
 * These paths are the contract the backend team needs to add.
 *
 * Required tables:
 *   field_ops_tasks, field_ops_shifts, field_ops_leave_requests,
 *   field_ops_expenses, field_ops_location_pings
 *
 * Required endpoints (all auth-gated):
 *   GET  /api/field-ops/health
 *   GET  /api/field-ops/snapshot
 *   POST /api/field-ops/tasks
 *   PATCH /api/field-ops/tasks/{id}
 *   POST /api/field-ops/tasks/{id}/assign
 *   POST /api/field-ops/shifts/clock-in
 *   POST /api/field-ops/shifts/clock-out
 *   POST /api/field-ops/leave
 *   POST /api/field-ops/leave/{id}/review
 *   POST /api/field-ops/expenses
 *   POST /api/field-ops/expenses/{id}/review
 */
export const FIELD_OPS_HEALTH = "/api/field-ops/health";

export type FieldOpsSyncResult =
  | { ok: true }
  | { ok: false; status: number; error: string; retryable: boolean };

let cachedAvailability: { at: number; available: boolean; reason: string } | null = null;

export async function probeFieldOps(): Promise<{ available: boolean; reason: string }> {
  if (cachedAvailability && Date.now() - cachedAvailability.at < 30_000) {
    return cachedAvailability;
  }
  try {
    const res = await fetch(`${CAMARTES_API}${FIELD_OPS_HEALTH}`);
    const available = res.ok;
    const result = {
      at: Date.now(),
      available,
      reason: available ? "ok" : `Field ops API returned ${res.status}`,
    };
    cachedAvailability = result;
    return result;
  } catch {
    const result = { at: Date.now(), available: false, reason: "Field ops API unreachable" };
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

export async function pushFieldOpsMutation(
  item: OfflineItem,
  token: string | null,
): Promise<FieldOpsSyncResult> {
  if (!item.op) {
    return { ok: false, status: 0, error: "Queue item has no mutation payload.", retryable: false };
  }
  const probe = await probeFieldOps();
  if (!probe.available) {
    return { ok: false, status: 404, error: probe.reason, retryable: false };
  }
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Idempotency-Key": item.idempotencyKey,
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${CAMARTES_API}${pathFor(item.op)}`, {
      method: item.op.type === "set_task_status" ? "PATCH" : "POST",
      headers,
      body: JSON.stringify(item.op.payload),
    });
    if (res.ok) return { ok: true };
    let detail = `Field ops ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: res.status,
      error: detail,
      retryable: res.status >= 500 || res.status === 404 || res.status === 408 || res.status === 429,
    };
  } catch {
    return { ok: false, status: 0, error: "Network error while syncing field ops.", retryable: true };
  }
}
