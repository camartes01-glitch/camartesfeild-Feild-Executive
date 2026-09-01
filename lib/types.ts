export type TaskKind =
  | "address_verification"
  | "delivery"
  | "return"
  | "inventory"
  | "vendor_visit";

export type TaskStatus =
  | "assigned"
  | "in_progress"
  | "awaiting_photo"
  | "completed"
  | "blocked";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type UserRole = "field_executive" | "operations_manager";
export type AuthSource = "demo" | "camartes";
export type OfflineStatus = "pending" | "success" | "failed";

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
  userId: string;
  type: LeaveType;
  from: string;
  to: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  submittedAt: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

export type PingActivity = "hub" | "travel" | "customer" | "vendor" | "unknown";

export type LocationPing = {
  at: string;
  lat: number;
  lng: number;
  accuracyM: number;
  source: "gps" | "simulated";
  activity?: PingActivity;
  userId?: string;
};

export type AttemptCode =
  | "nsz"
  | "customer_unavailable"
  | "kit_refused"
  | "weather"
  | "vehicle"
  | "address"
  | "other";

export type TaskAttempt = {
  at: string;
  code: AttemptCode;
  note: string;
};

export type KitConditionGrade = "good" | "scuff" | "dent" | "missing";

export type KitCondition = {
  overall: KitConditionGrade;
  scuff: boolean;
  dent: boolean;
  missingParts: boolean;
  notes: string;
};

export type VendorIntel = {
  gstin: string;
  decisionMaker: string;
  competitor: string;
  ownedKit: string;
  nextShootDate: string;
};

export type FieldTask = {
  id: string;
  kind: TaskKind;
  title: string;
  bookingRef: string;
  assigneeId?: string;
  assignedAt?: string;
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
  otpGeneratedAt?: string;
  scannedSerials?: string[];
  whatsappSent?: boolean;
  customerRating?: number;
  slaMinutes?: number;
  priority?: TaskPriority;
  createdBy?: string;
  createdAt?: string;
  vendorId?: string;
  vendorOutcome?: VendorVisitOutcome;
  beatSeq?: number;
  beatWindow?: string;
  attempts?: TaskAttempt[];
  kitPickupCondition?: KitCondition;
  kitReturnCondition?: KitCondition;
  signatureSvg?: string;
  declineReason?: string;
  checkedInAt?: string;
  checkedInGeo?: GeoPoint;
  storeCheckedInAt?: string;
  storeCheckedInGeo?: GeoPoint;
  customerCheckedInAt?: string;
  customerCheckedInGeo?: GeoPoint;
  vendorIntel?: VendorIntel;
};

/** Camartes.com Services tab categories. */
export type VendorKind =
  | "photographer"
  | "videographer"
  | "album_designer"
  | "video_editor"
  | "web_live_services"
  | "led_wall"
  | "fly_cam"
  | "photography_firm"
  | "camera_rental"
  | "service_centres"
  | "outdoor_studios"
  | "editing_studios"
  | "printing_labs"
  | "software_services";

export type VendorListing = "business" | "freelancer" | "both";
export type VendorSource = "camartes" | "field";

export type VendorStatus = "prospect" | "visited" | "follow_up" | "onboarded" | "declined";

/** How the outlet responded to Camartes onboarding. `declined` is a legacy alias of not_interested. */
export type OnboardInterest =
  | "to_meet"
  | "interested"
  | "need_time"
  | "not_interested"
  | "follow_up"
  | "onboarded";

export type VendorVisitOutcome =
  | "interested"
  | "need_time"
  | "not_interested"
  | "follow_up"
  | "onboarded"
  | "courtesy"
  | "declined";

export type Vendor = {
  id: string;
  kind: VendorKind;
  listing: VendorListing;
  source: VendorSource;
  name: string;
  contact: string;
  phone: string;
  address: string;
  area: string;
  city: string;
  geo: GeoPoint;
  status: VendorStatus;
  /** True when this FE is working the outlet for Camartes onboarding (not a catalog listing). */
  onboarding?: boolean;
  interest?: OnboardInterest;
  lastVisitedAt?: string;
  nextMeetingAt?: string;
  nextMeetingNote?: string;
  partnerCode?: string;
  notes: string;
  photos?: GeoPhoto[];
  serviceTypes?: string[];
  kycVerified?: boolean;
  cameraCount?: number;
  equipmentCount?: number;
  profileUrl?: string;
  /** True when lat/lng is a city centroid, not a storefront pin. */
  geoApprox?: boolean;
  gstin?: string;
  decisionMaker?: string;
  competitor?: string;
  ownedKit?: string;
  nextShootDate?: string;
  declineReason?: string;
};

export type VendorVisit = {
  id: string;
  vendorId: string;
  at: string;
  outcome: VendorVisitOutcome;
  pitch: string;
  note: string;
  geo?: GeoPoint;
  onSite: boolean;
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
  userId: string;
  date: string;
  km: number;
  amountInr: number;
  note: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
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
  status: OfflineStatus;
  retries?: number;
  lastRetryAt?: string;
  lastError?: string;
  idempotencyKey: string;
  op?: FieldOpsMutation;
};

export type FieldOpsMutation =
  | { type: "create_task"; payload: FieldTask }
  | { type: "assign_task"; payload: { taskId: string; assigneeId: string; assignedAt: string } }
  | { type: "set_task_status"; payload: { taskId: string; status: TaskStatus; label: string } }
  | { type: "clock_in"; payload: Shift }
  | { type: "clock_out"; payload: { shiftId: string; clockOut: string } }
  | { type: "request_leave"; payload: LeaveRequest }
  | { type: "review_leave"; payload: { id: string; status: LeaveStatus; reviewedAt: string; reviewedBy: string } }
  | { type: "add_expense"; payload: ExpenseClaim }
  | { type: "review_expense"; payload: { id: string; status: "approved" | "rejected"; reviewedAt: string; reviewedBy: string } };

export type CreateTaskInput = {
  title: string;
  description: string;
  kind: TaskKind;
  customerName: string;
  customerPhone?: string;
  area: string;
  address?: string;
  vendorId?: string;
  priority: TaskPriority;
  dueAt: string;
  assigneeId?: string;
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
  presence: "live_gps" | "last_seen" | "directory";
  lastSeenAt?: string;
};

export type Shift = {
  id: string;
  userId: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  clockInGeo?: GeoPoint;
  clockOutGeo?: GeoPoint;
  selfieUri?: string;
  geofenceOk?: boolean;
  geofenceOverride?: string;
  otRequested?: boolean;
  safetyHelmet?: boolean;
  safetyTwoWheeler?: boolean;
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
  phone: string;
  employeeId: string;
  role: UserRole;
  hub: string;
  avatarInitials: string;
  employment: "Camartes employee";
  source: AuthSource;
};

export type AuthSession = {
  user: FieldUser;
  token: string | null;
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
  vendors: Vendor[];
  vendorVisits: VendorVisit[];
};
