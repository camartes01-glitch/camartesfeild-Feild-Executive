/**
 * Presentation helpers. Business decisions (radius, SLA status, PIN, custody) are made by the
 * server; these functions only decide what to show and which step comes next.
 */
import { haversineKm } from "@/lib/geo";
import type { GeoPoint, Home, Sla, SlaStatus, Task, TaskDetail, TaskState } from "@/lib/types";

/** Server clock minus device clock, captured when a response carries `serverTime`. */
export function clockOffsetMs(serverTime: string | null | undefined, deviceNow = Date.now()): number {
  const t = serverTime ? Date.parse(serverTime) : NaN;
  return Number.isFinite(t) ? t - deviceNow : 0;
}

export type SlaView = { status: SlaStatus | null; tone: "green" | "peach" | "red" | "default"; remainingSec: number | null };

/**
 * Live countdown for display. The deadline and status come from the server; the ticking uses the
 * server-corrected clock (device time + offset), so a wrong phone clock cannot hide a breach.
 */
export function slaView(sla: Sla | null | undefined, offsetMs: number, atRiskMin: number, deviceNow = Date.now(), completed = false): SlaView {
  if (!sla || !sla.dueAt || sla.status === null) return { status: null, tone: "default", remainingSec: null };
  if (completed) {
    return { status: sla.status, tone: sla.status === "BREACHED" ? "red" : "green", remainingSec: sla.remainingSeconds };
  }
  const remaining = Math.round((Date.parse(sla.dueAt) - (deviceNow + offsetMs)) / 1000);
  // Never show a better state than the server reported.
  const derived: SlaStatus = remaining < 0 ? "BREACHED" : remaining <= atRiskMin * 60 ? "AT_RISK" : "ON_TRACK";
  const rank: Record<SlaStatus, number> = { ON_TRACK: 0, AT_RISK: 1, BREACHED: 2 };
  const status = rank[sla.status] > rank[derived] ? sla.status : derived;
  return { status, tone: status === "BREACHED" ? "red" : status === "AT_RISK" ? "peach" : "green", remainingSec: remaining };
}

export function formatCountdown(seconds: number | null): string {
  if (seconds === null) return "—";
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const body = h > 0 ? `${h}h ${m}m` : `${Math.max(m, abs > 0 && m === 0 ? 1 : 0)}m`;
  return seconds < 0 ? `-${body}` : body;
}

export const KIT_KINDS = new Set(["pickup", "delivery", "return"]);

export type Step =
  | "START_ROUTE"
  | "ARRIVE"
  | "CHECK_IN"
  | "START_WORK"
  | "SERIALS"
  | "KIT"
  | "PHOTO"
  | "PIN"
  | "POD"
  | "COMPLETE"
  | "RETRY"
  | "DONE"
  | "CANCELLED";

/** The single next thing the employee must do, derived from server state and evidence. */
export function nextStep(task: TaskDetail | Task, evidence?: TaskDetail["evidence"] | null): Step {
  const state: TaskState = task.state;
  if (state === "COMPLETED") return "DONE";
  if (state === "CANCELLED") return "CANCELLED";
  if (state === "FAILED_ATTEMPT") return "RETRY";
  if (state === "ASSIGNED" || state === "RETRY" || state === "UNASSIGNED") return "START_ROUTE";
  if (state === "EN_ROUTE") return "ARRIVE";
  if (state === "ARRIVED") return "CHECK_IN";
  if (state === "CHECKED_IN") return "START_WORK";
  if (KIT_KINDS.has(task.kind)) {
    if (task.items.some((i) => !i.serialVerified)) return "SERIALS";
    const graded = new Set((evidence?.kitConditions ?? []).map((k) => k.itemId));
    if (task.items.some((i) => !graded.has(i.itemId))) return "KIT";
  }
  const photos = (evidence?.photos ?? []).filter((p) => p.attemptNo === task.attemptNo);
  if (photos.length === 0) return "PHOTO";
  if (evidence?.pinRequired && evidence.pin?.state !== "VERIFIED") return "PIN";
  if (evidence?.podRequired && !evidence.pod) return "POD";
  return "COMPLETE";
}

type PendingAction = { path: string; body: Record<string, unknown>; status: string };

/**
 * Overlay the employee's own queued (unsynced) steps on the last server state so offline work
 * can continue. The result is only used to pick the next step; everything it adds is shown as
 * "waiting to sync", never as confirmed.
 */
export function projectTask(task: TaskDetail, pending: PendingAction[]): { task: TaskDetail; pendingSteps: Set<string> } {
  const live = pending.filter((p) => p.status !== "FAILED" && p.status !== "SYNCED");
  if (!live.length) return { task, pendingSteps: new Set() };
  const next: TaskDetail = {
    ...task,
    items: task.items.map((i) => ({ ...i })),
    evidence: {
      ...task.evidence,
      photos: [...task.evidence.photos],
      kitConditions: [...task.evidence.kitConditions],
    },
  };
  const steps = new Set<string>();
  const stateAfter: Record<string, TaskState> = {
    "en-route": "EN_ROUTE",
    arrived: "ARRIVED",
    "check-in": "CHECKED_IN",
    start: "IN_PROGRESS",
    complete: "COMPLETED",
    fail: "FAILED_ATTEMPT",
    retry: "RETRY",
  };
  for (const p of live) {
    const action = p.path.split("/").pop() ?? "";
    steps.add(action);
    if (stateAfter[action]) next.state = stateAfter[action];
    if (action === "retry") next.attemptNo = task.attemptNo + 1;
    if (action === "verify-serial") {
      const item = next.items.find((i) => i.itemId === p.body.itemId);
      if (item) item.serialVerified = true;
    }
    if (action === "kit-condition") {
      next.evidence.kitConditions.push({
        itemId: String(p.body.itemId),
        grade: p.body.grade as TaskDetail["evidence"]["kitConditions"][number]["grade"],
        phase: "PENDING",
        notes: null,
        at: "",
      });
    }
    if (action === "photos") {
      next.evidence.photos.push({
        id: `pending-${next.evidence.photos.length}`,
        mediaId: "",
        url: null,
        checkpoint: String(p.body.checkpoint ?? ""),
        lat: 0,
        lng: 0,
        accuracyM: null,
        attemptNo: next.attemptNo,
        at: "",
      });
    }
    if (action === "pod") {
      next.evidence.pod = { recipientName: String(p.body.recipientName ?? ""), signatureUrl: null, at: "", lat: 0, lng: 0 };
    }
  }
  return { task: next, pendingSteps: steps };
}

export type Manager = Home["cityManagers"][number];

/** Offline fallback for SOS: nearest manager by GPS, else the employee's own hub manager. */
export function nearestManager(fix: GeoPoint | null, managers: Manager[], hubId: string | null): (Manager & { distanceKm: number | null }) | null {
  if (!managers.length) return null;
  if (fix) {
    let best = managers[0];
    let bestKm = haversineKm(fix, best);
    for (const m of managers.slice(1)) {
      const km = haversineKm(fix, m);
      if (km < bestKm) {
        best = m;
        bestKm = km;
      }
    }
    return { ...best, distanceKm: Math.round(bestKm * 100) / 100 };
  }
  const own = managers.find((m) => m.hubId === hubId) ?? managers[0];
  return { ...own, distanceKm: null };
}

/** Route order for the Jobs list: active first, then by server SLA deadline. */
export function orderTasks(tasks: Task[]): Task[] {
  const active = new Set<TaskState>(["EN_ROUTE", "ARRIVED", "CHECKED_IN", "IN_PROGRESS"]);
  const closed = new Set<TaskState>(["COMPLETED", "CANCELLED"]);
  return [...tasks].sort((a, b) => {
    const ga = closed.has(a.state) ? 2 : active.has(a.state) ? 0 : 1;
    const gb = closed.has(b.state) ? 2 : active.has(b.state) ? 0 : 1;
    if (ga !== gb) return ga - gb;
    const da = a.sla.dueAt ? Date.parse(a.sla.dueAt) : Number.POSITIVE_INFINITY;
    const db = b.sla.dueAt ? Date.parse(b.sla.dueAt) : Number.POSITIVE_INFINITY;
    return da - db || a.id.localeCompare(b.id);
  });
}

export function distanceToStopKm(fix: GeoPoint | null, task: Task): number | null {
  if (!fix || !task.stop) return null;
  return haversineKm(fix, task.stop);
}
