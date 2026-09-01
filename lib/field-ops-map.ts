import { BANJARA } from "@/lib/seed";
import type {
  ExpenseClaim,
  FieldTask,
  FieldUser,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  Shift,
  TaskKind,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function str(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function num(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

const TASK_KINDS: TaskKind[] = [
  "address_verification",
  "delivery",
  "return",
  "inventory",
  "vendor_visit",
];
const TASK_STATUSES: TaskStatus[] = [
  "unassigned",
  "assigned",
  "in_progress",
  "awaiting_photo",
  "completed",
  "blocked",
];
const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];
const LEAVE_TYPES: LeaveType[] = ["casual", "sick", "earned", "unpaid"];
const LEAVE_STATUSES: LeaveStatus[] = ["pending", "approved", "rejected"];

function initialsFrom(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "C") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function mapPrincipal(raw: unknown): FieldUser | null {
  const row = asRecord(raw);
  if (!row) return null;
  const roleRaw = str(row.role);
  const role = roleRaw === "operations_manager" || roleRaw === "field_executive" ? roleRaw : null;
  if (!role) return null;
  const id = str(row.id);
  const name = str(row.displayName, row.name, row.emailOrPhone);
  const email = str(row.emailOrPhone, row.email);
  if (!id && !email) return null;
  return {
    id: id || email,
    name: name || email || "Field Operations user",
    email: email || `${id}@camartes.com`,
    phone: str(row.phone),
    employeeId: str(row.employeeId, row.employee_id, id) || "CM-FE",
    role,
    hub: str(row.hub, row.city) || "Hyderabad",
    avatarInitials: initialsFrom(name || email || "CM"),
    employment: "Camartes employee",
    source: "field_ops",
  };
}

export function mapTaskStatus(raw: unknown): TaskStatus {
  const value = str(raw);
  if (value === "cancelled") return "blocked";
  if ((TASK_STATUSES as string[]).includes(value)) return value as TaskStatus;
  return "assigned";
}

export function mapTask(raw: unknown, previous?: FieldTask): FieldTask {
  const row = asRecord(raw) ?? {};
  const kindRaw = str(row.kind, row.taskType, row.task_type);
  const kind = (TASK_KINDS as string[]).includes(kindRaw) ? (kindRaw as TaskKind) : "delivery";
  const priorityRaw = str(row.priority, "normal").toLowerCase();
  const place = asRecord(row.customerPlace);
  const area = str(row.area, place?.area, previous?.customerPlace.area) || "Hyderabad";
  const customerName = str(row.customerName, row.customer, previous?.customerName) || "Customer";
  const scheduledFor =
    str(row.scheduledFor, row.dueAt, row.due_at, previous?.scheduledFor) || new Date().toISOString();
  const id = str(row.id, row.taskCode, previous?.id) || `TSK-${Date.now()}`;
  const status = mapTaskStatus(row.status);
  const assigneeId = str(row.assigneeId, row.assignee_id) || undefined;
  return {
    id,
    kind,
    title: str(row.title, previous?.title) || id,
    bookingRef: str(row.bookingRef, previous?.bookingRef) || `BK-${id.replace(/^TSK-/, "")}`,
    assigneeId: status === "unassigned" ? undefined : assigneeId,
    assignedAt: str(row.assignedAt, previous?.assignedAt) || undefined,
    customerName,
    customerPhone: str(row.customerPhone, place?.phone, previous?.customerPhone),
    status: status === "unassigned" && assigneeId ? "assigned" : status,
    scheduledFor,
    store: previous?.store ?? BANJARA,
    customerPlace: previous?.customerPlace ?? {
      id: `place-${id}`,
      name: customerName,
      address: str(row.address, place?.address, area),
      area,
      phone: str(row.customerPhone, place?.phone) || undefined,
      geo: BANJARA.geo,
    },
    items: Array.isArray(row.items) ? (row.items as FieldTask["items"]) : (previous?.items ?? []),
    notes: str(row.notes, row.description, previous?.notes),
    photos: Array.isArray(row.photos) ? (row.photos as FieldTask["photos"]) : (previous?.photos ?? []),
    timeline: Array.isArray(row.timeline)
      ? (row.timeline as FieldTask["timeline"])
      : (previous?.timeline ?? []),
    startedAt: str(row.startedAt, previous?.startedAt) || undefined,
    completedAt: str(row.completedAt, previous?.completedAt) || undefined,
    customerConfirmed: previous?.customerConfirmed,
    otpCode: previous?.otpCode,
    otpVerified: previous?.otpVerified,
    otpGeneratedAt: previous?.otpGeneratedAt,
    scannedSerials: previous?.scannedSerials,
    whatsappSent: previous?.whatsappSent,
    slaMinutes: num(row.slaMinutes, previous?.slaMinutes) || 90,
    priority: (PRIORITIES as string[]).includes(priorityRaw) ? (priorityRaw as TaskPriority) : "normal",
    createdBy: str(row.createdBy, previous?.createdBy) || undefined,
    createdAt: str(row.createdAt, previous?.createdAt) || undefined,
    vendorId: str(row.vendorId, row.vendor, previous?.vendorId) || undefined,
    beatSeq: previous?.beatSeq,
    beatWindow: previous?.beatWindow,
    attempts: previous?.attempts,
    kitPickupCondition: previous?.kitPickupCondition,
    kitReturnCondition: previous?.kitReturnCondition,
    signatureSvg: previous?.signatureSvg,
    checkedInAt: previous?.checkedInAt,
    checkedInGeo: previous?.checkedInGeo,
    storeCheckedInAt: previous?.storeCheckedInAt,
    storeCheckedInGeo: previous?.storeCheckedInGeo,
    customerCheckedInAt: previous?.customerCheckedInAt,
    customerCheckedInGeo: previous?.customerCheckedInGeo,
    vendorIntel: previous?.vendorIntel,
    vendorOutcome: previous?.vendorOutcome,
    declineReason: previous?.declineReason,
    addressMatch: previous?.addressMatch,
    inventoryCounted: previous?.inventoryCounted,
    customerRating: previous?.customerRating,
  };
}

export function mapShift(raw: unknown, previous?: Shift): Shift {
  const row = asRecord(raw) ?? {};
  const clockIn = str(row.clockIn, previous?.clockIn) || new Date().toISOString();
  return {
    id: str(row.id, previous?.id) || `sh-${Date.now()}`,
    userId: str(row.userId, previous?.userId),
    date: str(row.date, previous?.date, clockIn.slice(0, 10)),
    clockIn,
    clockOut: str(row.clockOut, previous?.clockOut) || undefined,
    clockInGeo: previous?.clockInGeo,
    clockOutGeo: previous?.clockOutGeo,
    selfieUri: previous?.selfieUri,
    geofenceOk: previous?.geofenceOk,
    geofenceOverride: previous?.geofenceOverride,
    otRequested: previous?.otRequested,
    safetyHelmet: previous?.safetyHelmet,
    safetyTwoWheeler: previous?.safetyTwoWheeler,
  };
}

export function mapLeave(raw: unknown): LeaveRequest {
  const row = asRecord(raw) ?? {};
  const typeRaw = str(row.type, row.leave_type, "casual");
  const statusRaw = str(row.status, "pending");
  const submittedAt = str(row.submittedAt, row.createdAt) || new Date().toISOString();
  return {
    id: str(row.id) || `LV-${Date.now()}`,
    userId: str(row.userId),
    type: (LEAVE_TYPES as string[]).includes(typeRaw) ? (typeRaw as LeaveType) : "casual",
    from: str(row.from, row.start_date),
    to: str(row.to, row.end_date),
    days: num(row.days),
    reason: str(row.reason),
    status: (LEAVE_STATUSES as string[]).includes(statusRaw) ? (statusRaw as LeaveStatus) : "pending",
    submittedAt,
    createdAt: str(row.createdAt, submittedAt),
    reviewedAt: str(row.reviewedAt) || undefined,
    reviewedBy: str(row.reviewedBy) || undefined,
  };
}

export function mapExpense(raw: unknown): ExpenseClaim {
  const row = asRecord(raw) ?? {};
  const statusRaw = str(row.status, "submitted");
  const status: ExpenseClaim["status"] =
    statusRaw === "approved" || statusRaw === "rejected" || statusRaw === "draft" || statusRaw === "submitted"
      ? statusRaw
      : "submitted";
  return {
    id: str(row.id) || `EX-${Date.now()}`,
    userId: str(row.userId),
    date: str(row.date),
    km: num(row.km),
    amountInr: num(row.amountInr, row.amount),
    note: str(row.note, row.description),
    status,
    createdAt: str(row.createdAt) || new Date().toISOString(),
    reviewedAt: str(row.reviewedAt) || undefined,
    reviewedBy: str(row.reviewedBy) || undefined,
  };
}
