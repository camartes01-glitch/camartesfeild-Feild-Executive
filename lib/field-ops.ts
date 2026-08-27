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

export function checkInTarget(task: FieldTask): GeoPoint {
  if (task.kind === "delivery" && task.status === "assigned") return task.store.geo;
  if (task.kind === "inventory") return task.store.geo;
  return task.customerPlace.geo;
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
