/**
 * Offline-first action queue. Pure functions only (no React Native imports) so the rules are
 * unit tested in Node.
 *
 * Rules:
 * - An item becomes SYNCED only after the server returns 2xx. Writing it to storage never syncs it.
 * - Every item carries a stable Idempotency-Key, so a replay after a crash or timeout cannot
 *   double-apply on the server.
 * - Items for the same entity (e.g. one task) are sent strictly in order. A later step never
 *   overtakes an earlier one that is still pending or has failed.
 * - Retryable failures (network, 5xx, 429) back off exponentially. Business rejections (4xx)
 *   become FAILED and wait for the employee to act.
 * - The queue is bounded: old SYNCED rows are pruned; unsynced work is never dropped silently.
 */

export type QueueStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED" | "RETRYING";

export type QueueMedia = {
  /** Local reference returned by media-store (file path on device, data URI on web). */
  ref: string;
  /** Body field that receives the uploaded media id. */
  field: string;
  /** When true the media id is appended to an array field. */
  array?: boolean;
  contentType: string;
  idempotencyKey: string;
};

export type QueueItem = {
  id: string;
  label: string;
  entityKey: string;
  method: "POST" | "PUT";
  path: string;
  body: Record<string, unknown>;
  idempotencyKey: string;
  media: QueueMedia[];
  status: QueueStatus;
  attempts: number;
  createdAt: number;
  nextAttemptAt: number;
  syncedAt?: number;
  lastError?: string;
  lastCode?: string;
  /** Id of the record the server created or confirmed (e.g. the leave request id). */
  serverId?: string;
};

export type NewQueueItem = {
  label: string;
  entityKey: string;
  path: string;
  method?: "POST" | "PUT";
  body: Record<string, unknown>;
  idempotencyKey: string;
  media?: QueueMedia[];
};

export type SendResult =
  | { ok: true; serverId?: string }
  | { ok: false; retryable: boolean; code: string; message: string };

export const MAX_ITEMS = 500;
export const KEEP_SYNCED = 50;
export const BASE_BACKOFF_MS = 2_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

export function createItem(input: NewQueueItem, now: number, id?: string): QueueItem {
  return {
    id: id ?? `q-${now}-${Math.random().toString(36).slice(2, 9)}`,
    label: input.label,
    entityKey: input.entityKey,
    method: input.method ?? "POST",
    path: input.path,
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    media: input.media ?? [],
    status: "PENDING",
    attempts: 0,
    createdAt: now,
    nextAttemptAt: now,
  };
}

/** Adds an item unless the same idempotency key is already queued (and not failed). */
export function enqueue(queue: QueueItem[], item: QueueItem): { queue: QueueItem[]; accepted: boolean; reason?: string } {
  if (queue.some((q) => q.idempotencyKey === item.idempotencyKey && q.status !== "FAILED")) {
    return { queue, accepted: false, reason: "DUPLICATE" };
  }
  let next = prune([...queue, item]);
  if (next.length > MAX_ITEMS) {
    return { queue, accepted: false, reason: "QUEUE_FULL" };
  }
  return { queue: next, accepted: true };
}

export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
  // ±20% jitter so a fleet coming back online does not retry in lockstep.
  return Math.round(exp * (0.8 + random() * 0.4));
}

/** After an app kill, anything caught mid-flight is retried; the idempotency key makes that safe. */
export function recoverOnStart(queue: QueueItem[], now: number): QueueItem[] {
  return queue.map((q) => (q.status === "SYNCING" ? { ...q, status: "RETRYING", nextAttemptAt: now } : q));
}

/** Oldest item that may be sent now, honouring per-entity order. */
export function nextEligible(queue: QueueItem[], now: number): QueueItem | null {
  const blocked = new Set<string>();
  const ordered = [...queue].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  for (const item of ordered) {
    if (item.status === "SYNCED") continue;
    if (blocked.has(item.entityKey)) continue;
    blocked.add(item.entityKey);
    if ((item.status === "PENDING" || item.status === "RETRYING") && item.nextAttemptAt <= now) return item;
  }
  return null;
}

export function markSyncing(queue: QueueItem[], id: string): QueueItem[] {
  return queue.map((q) => (q.id === id ? { ...q, status: "SYNCING" } : q));
}

export function applyResult(
  queue: QueueItem[],
  id: string,
  result: SendResult,
  now: number,
  random: () => number = Math.random,
): QueueItem[] {
  return queue.map((q) => {
    if (q.id !== id) return q;
    if (result.ok) {
      return { ...q, status: "SYNCED", syncedAt: now, lastError: undefined, lastCode: undefined, serverId: result.serverId };
    }
    const attempts = q.attempts + 1;
    if (result.retryable) {
      return {
        ...q,
        status: "RETRYING",
        attempts,
        nextAttemptAt: now + backoffMs(attempts, random),
        lastError: result.message,
        lastCode: result.code,
      };
    }
    return { ...q, status: "FAILED", attempts, lastError: result.message, lastCode: result.code };
  });
}

/** Employee chose to try a failed item again (e.g. after moving closer to the stop). */
export function retryNow(queue: QueueItem[], id: string, now: number): QueueItem[] {
  return queue.map((q) => (q.id === id && q.status === "FAILED" ? { ...q, status: "PENDING", nextAttemptAt: now } : q));
}

/** Server codes that judged the GPS fix itself: retrying with the same coordinates can never succeed. */
export const LOCATION_REJECTIONS = new Set(["OUTSIDE_CHECK_IN_RADIUS", "GPS_INACCURATE", "GPS_ACCURACY_REQUIRED", "GPS_REQUIRED", "MOCK_LOCATION"]);

export type Fix = { lat: number; lng: number; accuracyM: number; mocked: boolean; capturedAt: string };

/**
 * Retry a failed step. When the server rejected the location, the step is re-sent with the phone's current
 * fix and a new idempotency key (the request body changed, so the old key must not be reused).
 */
export function retryWithFreshFix(queue: QueueItem[], id: string, now: number, fix: Fix | null, newKey: string): QueueItem[] {
  return queue.map((q) => {
    if (q.id !== id || q.status !== "FAILED") return q;
    const locationRejected = LOCATION_REJECTIONS.has(q.lastCode ?? "") && "lat" in q.body;
    if (!locationRejected || !fix) return { ...q, status: "PENDING", nextAttemptAt: now };
    return { ...q, status: "PENDING", nextAttemptAt: now, body: { ...q.body, ...fix }, idempotencyKey: newKey };
  });
}

/** Employee discarded a rejected action. Only FAILED items can be discarded. */
export function discard(queue: QueueItem[], id: string): QueueItem[] {
  return queue.filter((q) => !(q.id === id && q.status === "FAILED"));
}

/** Server-confirmed work can drop the retry schedule for the same entity. */
export function releaseRetries(queue: QueueItem[], now: number): QueueItem[] {
  return queue.map((q) => (q.status === "RETRYING" ? { ...q, nextAttemptAt: Math.min(q.nextAttemptAt, now) } : q));
}

export function prune(queue: QueueItem[]): QueueItem[] {
  const synced = queue.filter((q) => q.status === "SYNCED").sort((a, b) => (b.syncedAt ?? 0) - (a.syncedAt ?? 0));
  const keep = new Set(synced.slice(0, KEEP_SYNCED).map((q) => q.id));
  return queue.filter((q) => q.status !== "SYNCED" || keep.has(q.id));
}

export function summarize(queue: QueueItem[]) {
  let pending = 0;
  let failed = 0;
  let syncing = 0;
  for (const q of queue) {
    if (q.status === "PENDING" || q.status === "RETRYING") pending += 1;
    else if (q.status === "FAILED") failed += 1;
    else if (q.status === "SYNCING") syncing += 1;
  }
  return { pending, failed, syncing, unsynced: pending + failed + syncing };
}

/**
 * Local work belongs to the employee who created it.
 * - Signing out keeps only that employee's unsynced work (they confirmed it); synced history is cleared.
 * - Signing in as a different employee discards all of it: it cannot sync under their account and must not
 *   be visible to them.
 */
export function retainOnSignOut(queue: QueueItem[]): QueueItem[] {
  return queue.filter((q) => q.status !== "SYNCED");
}

export function belongsToOtherEmployee(storedOwner: string | null, principalId: string): boolean {
  return storedOwner !== null && storedOwner !== principalId;
}

export function pendingFor(queue: QueueItem[], entityKey: string): QueueItem[] {
  return queue.filter((q) => q.entityKey === entityKey && q.status !== "SYNCED");
}

/** Places the uploaded media ids into the request body. */
export function withMediaIds(body: Record<string, unknown>, media: QueueMedia[], ids: string[]): Record<string, unknown> {
  const next: Record<string, unknown> = { ...body };
  media.forEach((m, index) => {
    const id = ids[index];
    if (m.array) {
      const current = Array.isArray(next[m.field]) ? (next[m.field] as unknown[]) : [];
      next[m.field] = [...current, id];
    } else {
      next[m.field] = id;
    }
  });
  return next;
}
