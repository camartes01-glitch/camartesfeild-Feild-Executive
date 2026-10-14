/**
 * Types mirror the Camartes Field Operations API. The server is the source of truth for
 * tasks, SLA, evidence, inventory, rosters and shifts; the app never invents these values.
 */

export type Lang = "en" | "hi" | "te";
export type UserRole = "field_executive" | "operations_manager";

export type TaskKind =
  | "pickup"
  | "delivery"
  | "return"
  | "address_verification"
  | "inventory"
  | "vendor_visit"
  | "marketplace_booking";

export type TaskState =
  | "UNASSIGNED"
  | "ASSIGNED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "CHECKED_IN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED_ATTEMPT"
  | "RETRY"
  | "CANCELLED";

export type SlaStatus = "ON_TRACK" | "AT_RISK" | "BREACHED";
export type StopType = "HUB" | "CUSTOMER" | "VENDOR" | "OUTLET";
export type KitGrade = "GOOD" | "SCUFF" | "DENT" | "MISSING";
export type FailureCode = "NSZ" | "CUSTOMER_UNAVAILABLE" | "KIT_REFUSED" | "WEATHER" | "VEHICLE" | "ADDRESS";
export type VisitStatus = "INTERESTED" | "NEED_TIME" | "NOT_INTERESTED" | "FOLLOW_UP" | "ONBOARDED";
export type PartnerType =
  | "PHOTOGRAPHY_STUDIO"
  | "FREELANCE_PHOTOGRAPHER"
  | "VIDEOGRAPHER"
  | "ALBUM_DESIGNER"
  | "VIDEO_EDITOR"
  | "LED_WALL_PARTNER"
  | "WEBLIVE_PARTNER";

export type GeoPoint = { lat: number; lng: number; accuracyM?: number | null };

export type Principal = {
  id: string;
  employeeId: string;
  role: UserRole;
  displayName: string;
  emailOrPhone: string;
  isActive: boolean;
  phone?: string | null;
  city?: string | null;
  hubId?: string | null;
  geoUnit?: GeoBrief | null;
  scopeGeoUnit?: GeoBrief | null;
};

/** Compact geography reference carried on operational records (full hierarchy via /api/geography). */
export type GeoBrief = { id: string; name: string; level: string; subtype?: string | null; status?: string };

export type Hub = { id: string; name: string; city: string; address?: string | null; lat: number; lng: number; geo?: GeoBrief | null };

export type Sla = {
  status: SlaStatus | null;
  remainingSeconds: number | null;
  dueAt: string | null;
  startAt: string | null;
  breachedAt: string | null;
  lateReason: string | null;
};

export type TaskItem = {
  itemId: string;
  sku: string;
  name: string;
  serial: string; // masked for field executives: the last 4 come from the physical label
  condition: KitGrade;
  locationType: string;
  serialVerified: boolean;
};

export type Stop = { type: StopType | null; name: string | null; address: string | null; lat: number; lng: number };

export type Task = {
  id: string;
  taskCode: string;
  title: string;
  kind: TaskKind;
  notes: string;
  customerName: string;
  customerPhone: string | null;
  area: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: string;
  state: TaskState;
  attemptNo: number;
  assigneeId: string | null;
  hubId: string | null;
  stop: Stop | null;
  sla: Sla;
  startedAt: string | null;
  checkedInAt: string | null;
  completedAt: string | null;
  items: TaskItem[];
  createdAt: string | null;
  updatedAt: string | null;
  geo?: GeoBrief | null;
};

export type TaskEvidence = {
  checkIn: { at: string; distanceM: number; accuracyM: number | null; lat: number; lng: number } | null;
  rejectedCheckIns: { at: string; code: string; distanceM: number | null }[];
  photos: {
    id: string;
    mediaId: string;
    url: string | null;
    checkpoint: string;
    lat: number;
    lng: number;
    accuracyM: number | null;
    attemptNo: number;
    at: string;
  }[];
  kitConditions: { itemId: string; grade: KitGrade; phase: string; notes: string | null; at: string }[];
  pin: { state: "ACTIVE" | "EXPIRED" | "LOCKED" | "VERIFIED"; expiresAt: string; attemptsLeft: number } | null;
  pinRequired: boolean;
  pinDelivery: "IN_APP" | "WHATSAPP";
  podRequired: boolean;
  pod: { recipientName: string; signatureUrl: string | null; at: string; lat: number; lng: number } | null;
  failures: { attemptNo: number; code: FailureCode; label: string; notes: string | null; slaStatus: string | null; at: string }[];
};

export type TaskDetail = Task & {
  evidence: TaskEvidence;
  timeline: { id: string; at: string; label: string; eventType: string }[];
  serverTime: string;
};

export type RosterStop = {
  id: string;
  sequence: number;
  type: StopType;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  windowStart: string | null;
  windowEnd: string | null;
  task: Task | null;
};

export type Roster = {
  id?: string;
  date: string;
  published: boolean;
  version?: number;
  shiftStart?: string;
  shiftEnd?: string;
  hub?: Hub | null;
  updatedAt?: string;
  stops: RosterStop[];
};

export type Shift = {
  id: string;
  userId: string;
  clockIn: string;
  clockOut: string | null;
  clockInGeo: GeoPoint | null;
  clockInVia: "FIRST_STOP" | "ROSTER_WINDOW" | "OVERRIDE" | null;
  clockInDistanceKm: number | null;
  overrideReason: string | null;
  minutes?: number;
};

export type ShiftSummary = {
  shiftId: string;
  workedMinutes: number;
  overtimeMinutes: number;
  travelMinutes: number;
  hubMinutes: number;
  customerMinutes: number;
  vendorMinutes: number;
  distanceKm: number;
  gpsPoints: number;
  tasksCompleted: number;
};

export type Home = {
  serverTime: string;
  employee: Principal & { hub: Hub | null };
  shift: Shift | null;
  clockInGate: {
    firstStop: { name: string; lat: number; lng: number; taskId: string | null } | null;
    rosterWindow: { opensAt: string; startAt: string; endAt: string; open: boolean } | null;
    radiusKm: number;
  };
  today: Roster;
  tomorrow: Roster;
  nextTask: Task | null;
  openTasks: Task[];
  counts: { completed: number; pending: number; failed: number; slaAtRisk: number; slaBreached: number };
  unreadNotifications: number;
  cityManagers: {
    id: string;
    name: string;
    phone: string | null;
    city: string | null;
    hubId: string;
    hubName: string;
    lat: number;
    lng: number;
  }[];
};

export type OpsConfig = {
  rules: {
    clockInRadiusKm: number;
    rosterEarlyLoginMin: number;
    checkInRadiusM: number;
    maxGpsAccuracyM: number;
    hubRadiusM: number;
    pinTtlMin: number;
    pinMaxAttempts: number;
    returnRequiresPin: boolean;
    slaAtRiskMin: number;
    slaLateReasonRequired: boolean;
    gpsPointIntervalS: number;
    gpsBatchMax: number;
    standardShiftMin: number;
    tzOffsetMin: number;
  };
  failureCodes: { code: FailureCode; label: string }[];
  kitGrades: KitGrade[];
  partnerTypes: { code: PartnerType; label: string }[];
  visitStatuses: VisitStatus[];
  nextMeetingRequiredFor: VisitStatus[];
  serverTime: string;
};

export type Partner = {
  id: string;
  partnerType: PartnerType;
  partnerTypeLabel: string;
  businessName: string;
  contactPerson: string;
  phone: string | null;
  address: string | null;
  lat: number;
  lng: number;
  gstAvailable: boolean | null;
  gstNumber: string | null;
  status: VisitStatus;
  nextMeetingAt: string | null;
  updatedAt: string;
};

export type OnboardingVisit = {
  id: string;
  partnerId: string;
  partner: Partner | null;
  visitStatus: VisitStatus;
  gstAvailable: boolean;
  gstNumber: string | null;
  nextMeetingAt: string | null;
  notes: string | null;
  photos: { mediaId: string; url: string | null }[];
  lat: number;
  lng: number;
  employeeId: string;
  visitedAt: string;
};

export type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  serial: string;
  condition: KitGrade;
  locationType: "HUB" | "EMPLOYEE" | "CUSTOMER" | "STORE";
  locationId: string;
  updatedAt: string;
};

export type LeaveBalance = { type: "casual" | "sick" | "earned"; entitled: number; used: number; pending: number; available: number };
export type LeaveRequest = {
  id: string;
  type: "casual" | "sick" | "earned" | "unpaid";
  from: string;
  to: string;
  days: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
};

export type HoursMonth = {
  month: string;
  standardShiftMinutes: number;
  attendanceDays: number;
  workedMinutes: number;
  overtimeMinutes: number;
  days: { date: string; workedMinutes: number; overtimeMinutes: number }[];
  shifts: {
    shiftId: string;
    clockIn: string;
    clockOut: string | null;
    workedMinutes: number;
    overtimeMinutes: number;
    overtimeRequest: { status: string } | null;
    via: string | null;
  }[];
};

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  at: string;
};

export type SosResult = {
  id: string;
  at: string;
  gpsRecorded: boolean;
  manager: { id: string; name: string; phone: string | null; city: string | null; distanceKm: number | null } | null;
  /** What the server actually delivered: in-app notifications and the push outcome. */
  delivery?: { inAppNotified: number; push: "SENT" | "PUSH_DISABLED" | "NO_DEVICE" | "FAILED" | "PARTIAL" | "NONE" };
};

export type AuthSession = { user: Principal; token: string; expiresAt: string | null };
