import { differenceInMinutes, parseISO } from "date-fns";
import { BANJARA, HITEC } from "@/lib/seed";
import { GEOFENCE_KM, haversineKm } from "@/lib/geo";
import type {
  AttemptCode,
  FieldTask,
  GeoPoint,
  KitConditionGrade,
  LocationPing,
  PingActivity,
  Vendor,
} from "@/lib/types";

export const CHECK_IN_KM = 0.15;
/** Shift punch-in: within this distance of the day's first assigned stop. */
export const SHIFT_START_KM = 5;
/** Minutes before roster start when login is allowed. */
export const LOGIN_EARLY_MIN = 30;

export type RosterRow = { date: string; window: string };

export function istYmd(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function addYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function istMinutesOfDay(d = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function parseRosterWindow(window: string): { startMin: number; endMin: number } | null {
  const m = window.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { startMin: Number(m[1]) * 60 + Number(m[2]), endMin: Number(m[3]) * 60 + Number(m[4]) };
}

export function rosterLoginOpen(roster: RosterRow[], now = new Date(), earlyMin = LOGIN_EARLY_MIN) {
  const ymd = istYmd(now);
  const row = roster.find((r) => r.date === ymd);
  if (!row) return { ok: false, window: null as string | null, date: ymd };
  const parsed = parseRosterWindow(row.window);
  if (!parsed) return { ok: false, window: row.window, date: ymd };
  const mins = istMinutesOfDay(now);
  const ok = mins >= parsed.startMin - earlyMin && mins <= parsed.endMin;
  return { ok, window: row.window, date: ymd };
}

export function firstAssignedTask(tasks: FieldTask[], ymd: string): FieldTask | null {
  const open = tasks.filter(
    (t) => t.scheduledFor.slice(0, 10) === ymd && t.status !== "completed" && t.status !== "blocked",
  );
  if (!open.length) return null;
  return [...open].sort(
    (a, b) => (a.beatSeq ?? 99) - (b.beatSeq ?? 99) || a.scheduledFor.localeCompare(b.scheduledFor),
  )[0];
}

export type ShiftClockInVia = "first_task" | "roster" | "override";

export type ShiftClockInEval = {
  allowed: boolean;
  via: ShiftClockInVia | null;
  firstTask: FieldTask | null;
  kmToFirst: number | null;
  rosterOk: boolean;
  geoOk: boolean;
  rosterWindow: string | null;
};

export function evaluateShiftClockIn(args: {
  geo: GeoPoint | null;
  now?: Date;
  tasks: FieldTask[];
  roster: RosterRow[];
  overrideReason?: string;
}): ShiftClockInEval {
  const now = args.now ?? new Date();
  const ymd = istYmd(now);
  const first = firstAssignedTask(args.tasks, ymd);
  let kmToFirst: number | null = null;
  let geoOk = false;
  if (args.geo && first) {
    kmToFirst = haversineKm(args.geo, checkInTarget(first));
    geoOk = kmToFirst <= SHIFT_START_KM;
  }
  const roster = rosterLoginOpen(args.roster, now);
  const override = Boolean(args.overrideReason?.trim());
  if (geoOk) {
    return {
      allowed: true,
      via: "first_task",
      firstTask: first,
      kmToFirst,
      rosterOk: roster.ok,
      geoOk,
      rosterWindow: roster.window,
    };
  }
  if (roster.ok) {
    return {
      allowed: true,
      via: "roster",
      firstTask: first,
      kmToFirst,
      rosterOk: true,
      geoOk,
      rosterWindow: roster.window,
    };
  }
  if (override) {
    return {
      allowed: true,
      via: "override",
      firstTask: first,
      kmToFirst,
      rosterOk: roster.ok,
      geoOk,
      rosterWindow: roster.window,
    };
  }
  return {
    allowed: false,
    via: null,
    firstTask: first,
    kmToFirst,
    rosterOk: roster.ok,
    geoOk,
    rosterWindow: roster.window,
  };
}

export const ATTEMPT_LABELS: Record<AttemptCode, string> = {
  nsz: "NSZ — no such zone",
  customer_unavailable: "Customer unavailable",
  kit_refused: "Kit refused",
  weather: "Weather / access",
  vehicle: "Vehicle / breakdown",
  address: "Wrong / incomplete address",
  other: "Other",
};

export const KIT_GRADES: { id: KitConditionGrade; label: string }[] = [
  { id: "good", label: "Good" },
  { id: "scuff", label: "Scuff" },
  { id: "dent", label: "Dent" },
  { id: "missing", label: "Missing parts" },
];

export type SlaState = {
  remainingMin: number;
  dueAt: string;
  tone: "ok" | "warn" | "late";
  label: string;
};

export function slaState(task: FieldTask, now = new Date()): SlaState {
  const due = parseISO(task.scheduledFor);
  const remainingMin = differenceInMinutes(due, now);
  const tone: SlaState["tone"] =
    remainingMin < 0 ? "late" : remainingMin <= 45 ? "warn" : "ok";
  const abs = Math.abs(remainingMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const clock = h > 0 ? `${h}h ${m}m` : `${m}m`;
  const label =
    remainingMin < 0 ? `SLA ${clock} late` : remainingMin === 0 ? "SLA due now" : `SLA ${clock} left`;
  return { remainingMin, dueAt: task.scheduledFor, tone, label };
}

export type TaskCheckInStage = "store" | "customer";

export function nextCheckInStage(task: FieldTask): TaskCheckInStage {
  if (task.kind === "delivery") return task.storeCheckedInAt ? "customer" : "store";
  if (task.kind === "return") return task.customerCheckedInAt ? "store" : "customer";
  return task.kind === "inventory" ? "store" : "customer";
}

export function checkInProgress(task: FieldTask): { done: number; total: number } {
  if (task.kind === "delivery" || task.kind === "return") {
    return {
      done: Number(Boolean(task.storeCheckedInAt)) + Number(Boolean(task.customerCheckedInAt)),
      total: 2,
    };
  }
  return { done: task.checkedInAt ? 1 : 0, total: 1 };
}

export function checkInTarget(task: FieldTask): GeoPoint {
  return nextCheckInStage(task) === "store" ? task.store.geo : task.customerPlace.geo;
}

export function classifyActivity(
  point: GeoPoint,
  tasks: FieldTask[],
  vendors: Vendor[],
): PingActivity {
  const hubKm = Math.min(haversineKm(point, BANJARA.geo), haversineKm(point, HITEC.geo));
  if (hubKm <= GEOFENCE_KM) return "hub";
  for (const t of tasks) {
    if (haversineKm(point, t.customerPlace.geo) <= CHECK_IN_KM) return "customer";
    if (haversineKm(point, t.store.geo) <= CHECK_IN_KM) return "hub";
  }
  for (const v of vendors) {
    if (v.geoApprox) continue;
    if (haversineKm(point, v.geo) <= CHECK_IN_KM) return "vendor";
  }
  return "travel";
}

export function activityMinutes(pings: LocationPing[], now = new Date()) {
  const buckets: Record<PingActivity, number> = {
    hub: 0,
    travel: 0,
    customer: 0,
    vendor: 0,
    unknown: 0,
  };
  if (pings.length === 0) return buckets;
  const sorted = [...pings].sort((a, b) => a.at.localeCompare(b.at));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const nextAt = i + 1 < sorted.length ? parseISO(sorted[i + 1].at) : now;
    const mins = Math.min(20, Math.max(0, differenceInMinutes(nextAt, parseISO(a.at))));
    const key = a.activity ?? "unknown";
    buckets[key] += mins;
  }
  return buckets;
}
