export type TaskKind =
  | "address_verification"
  | "delivery"
  | "return"
  | "inventory";

export type TaskStatus =
  | "assigned"
  | "in_progress"
  | "awaiting_photo"
  | "completed"
  | "blocked";

export type LeaveType = "casual" | "sick" | "earned" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected";

export type GeoPoint = {
  lat: number;
  lng: number;
  accuracyM?: number;
  capturedAt?: string;
};

export type Place = {
  id: string;
  name: string;
  address: string;
  area: string;
  phone?: string;
  geo: GeoPoint;
};

export type EquipmentItem = {
  sku: string;
  name: string;
  serial: string;
  condition: "good" | "fair" | "damaged";
  qty: number;
};

export type GeoPhoto = {
  id: string;
  taskId: string;
  checkpoint: string;
  uri: string;
  note?: string;
  geo: Required<Pick<GeoPoint, "lat" | "lng">> & {
    accuracyM: number;
    capturedAt: string;
  };
};

export type TaskEvent = {
  id: string;
  at: string;
  label: string;
};

export type LeaveRequest = {
  id: string;
  type: LeaveType;
  from: string;
  to: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  submittedAt: string;
};

export type LocationPing = {
  at: string;
  lat: number;
  lng: number;
  accuracyM: number;
  source: "gps" | "simulated";
};

export type FieldTask = {
  id: string;
  kind: TaskKind;
  title: string;
  bookingRef: string;
  customerName: string;
  customerPhone: string;
  status: TaskStatus;
  scheduledFor: string;
  store: Place;
  customerPlace: Place;
  items: EquipmentItem[];
  notes: string;
  photos: GeoPhoto[];
  timeline: TaskEvent[];
  startedAt?: string;
  completedAt?: string;
  customerConfirmed?: boolean;
  addressMatch?: "match" | "mismatch" | "unverified";
  inventoryCounted?: Record<string, number>;
  otpCode?: string;
  otpVerified?: boolean;
  scannedSerials?: string[];
  whatsappSent?: boolean;
  customerRating?: number;
  slaMinutes?: number;
};

export type DamageReport = {
  id: string;
  taskId: string;
  serial: string;
  note: string;
  at: string;
};

export type ExpenseClaim = {
  id: string;
  date: string;
  km: number;
  amountInr: number;
  note: string;
  status: "draft" | "submitted" | "approved";
};

export type AuditEvent = {
  id: string;
  at: string;
  label: string;
};

export type OfflineItem = {
  id: string;
  at: string;
  label: string;
  synced: boolean;
};

export type AppNotice = {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
};

export type TrainingItem = {
  id: string;
  title: string;
  body: string;
  done: boolean;
};

export type TeamMate = {
  id: string;
  name: string;
  employeeId: string;
  status: "on_shift" | "off_shift" | "on_task";
  area: string;
  geo: GeoPoint;
};

export type Shift = {
  id: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  clockInGeo?: GeoPoint;
  clockOutGeo?: GeoPoint;
  selfieUri?: string;
  geofenceOk?: boolean;
  geofenceOverride?: string;
  otRequested?: boolean;
};

export type LeavePolicy = {
  casual: number;
  sick: number;
  earned: number;
};

export type FieldUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  employeeId: string;
  role: "Field Executive";
  hub: string;
  avatarInitials: string;
  employment: "Camartes employee";
};

export type Lang = "en" | "hi" | "te";

export type AppState = {
  userId: string | null;
  language: Lang;
  deviceBoundId: string | null;
  tasks: FieldTask[];
  shifts: Shift[];
  leaves: LeaveRequest[];
  pings: LocationPing[];
  damages: DamageReport[];
  expenses: ExpenseClaim[];
  audit: AuditEvent[];
  offlineQueue: OfflineItem[];
  notices: AppNotice[];
  training: TrainingItem[];
  leavePolicy: LeavePolicy;
};
