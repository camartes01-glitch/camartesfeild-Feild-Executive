import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Alert, Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { format } from "date-fns";
import { BANJARA, HITEC, createInitialState, LOCATION_PRESETS, ROSTER, USERS } from "@/lib/seed";
import { fetchCamartesVendors, overlayVendorState } from "@/lib/camartes-api";
import { primaryService } from "@/lib/camartes-services";
import { generateHandoverPin } from "@/lib/otp";
import { nearestCityManager } from "@/lib/cities";
import { formatKm, haversineKm } from "@/lib/geo";
import { ATTEMPT_LABELS, CHECK_IN_KM, checkInTarget, classifyActivity, evaluateShiftClockIn, nextCheckInStage } from "@/lib/field-ops";
import { clampServices, interestFromOutcome, normalizeOutcome, statusFromInterest } from "@/lib/vendor-onboard";
import type {
  AppState,
  AttemptCode,
  DamageReport,
  ExpenseClaim,
  FieldTask,
  FieldUser,
  GeoPhoto,
  KitCondition,
  Lang,
  LeaveRequest,
  LeaveType,
  LocationPing,
  Shift,
  TaskStatus,
  Vendor,
  VendorIntel,
  VendorKind,
  VendorListing,
  VendorVisit,
  VendorVisitOutcome,
} from "@/lib/types";

const KEY = "camartes-field-v10";
const HANDOVER_PIN_TTL_MS = 15 * 60 * 1000;

export type LocationMode = "gps" | string;

export type LiveFix = {
  lat: number;
  lng: number;
  accuracyM: number;
  source: "gps" | "simulated";
  at: string;
};

type AppContextValue = {
  ready: boolean;
  online: boolean;
  user: FieldUser | null;
  state: AppState;
  live: LiveFix | null;
  locationMode: LocationMode;
  setLocationMode: (mode: LocationMode) => void;
  setLanguage: (lang: Lang) => void;
  login: (email: string, password: string) => string | null;
  logout: () => void;
  clockIn: (opts?: {
    selfieUri?: string;
    overrideReason?: string;
    safetyHelmet?: boolean;
    safetyTwoWheeler?: boolean;
  }) => string | null;
  checkInTask: (taskId: string) => string | null;
  logAttempt: (taskId: string, code: AttemptCode, note: string) => void;
  saveKitCondition: (taskId: string, which: "pickup" | "return", condition: KitCondition) => void;
  saveSignature: (taskId: string, svg: string) => void;
  clockOut: () => void;
  requestOt: () => void;
  openShift: Shift | null;
  updateTask: (id: string, patch: Partial<FieldTask>) => void;
  assignTask: (taskId: string, assigneeId: string) => void;
  addPhoto: (taskId: string, photo: GeoPhoto) => void;
  setTaskStatus: (id: string, status: TaskStatus, label: string) => void;
  verifyOtp: (taskId: string, code: string) => boolean;
  generateOtp: (taskId: string) => string;
  matchSerial: (taskId: string, serial: string) => boolean;
  sendWhatsApp: (taskId: string, kind: "eta" | "delivered" | "collected") => void;
  addDamage: (report: Omit<DamageReport, "id" | "at">) => void;
  addExpense: (claim: Omit<ExpenseClaim, "id" | "status">) => void;
  markTraining: (id: string) => void;
  markNoticesRead: () => void;
  gpsMessage: string | null;
  refreshGps: () => void;
  cityManager: ReturnType<typeof nearestCityManager>;
  logVendorVisit: (input: {
    vendorId: string;
    outcome: VendorVisitOutcome;
    pitch: string;
    note: string;
    intel: VendorIntel;
    declineReason?: string;
    nextMeetingAt?: string;
    nextMeetingNote?: string;
    profile: {
      name: string;
      contact: string;
      phone: string;
      listing: VendorListing;
      serviceTypes: VendorKind[];
    };
  }) => { error: string } | { partnerCode?: string };
  addWalkInVendor: (input: {
    name: string;
    contact: string;
    phone: string;
    area: string;
    address: string;
    listing: VendorListing;
    serviceTypes: VendorKind[];
  }) => string | null;
  onboardVendor: (vendorId: string) => string;
  triggerSos: () => void;
  requestLeave: (input: {
    type: LeaveType;
    from: string;
    to: string;
    days: number;
    reason: string;
  }) => void;
  reviewLeave: (id: string, status: "approved" | "rejected") => void;
  reviewExpense: (id: string, status: "approved" | "rejected") => void;
  resetDemo: () => void;
  audit: (label: string) => void;
  refreshVendors: () => Promise<void>;
  vendorsSync: { loading: boolean; live: boolean | null; at: string | null; error: string | null };
};

const Ctx = createContext<AppContextValue | null>(null);

function mergeState(parsed: Partial<AppState>): AppState {
  const base = createInitialState();
  const incoming = parsed.tasks ?? [];
  const byId = new Map(incoming.map((t) => [t.id, t]));
  const tasks = base.tasks.map((seed) => {
    const saved = byId.get(seed.id);
    if (!saved) return seed;
    return {
      ...seed,
      ...saved,
      otpCode: saved.otpCode,
      otpGeneratedAt: saved.otpGeneratedAt,
      otpVerified: saved.otpVerified,
      items: saved.items?.length ? saved.items : seed.items,
      photos: saved.photos ?? seed.photos,
      timeline: saved.timeline?.length ? saved.timeline : seed.timeline,
    };
  });
  for (const saved of incoming) {
    if (!tasks.some((t) => t.id === saved.id)) tasks.push(saved);
  }
  return {
    ...base,
    ...parsed,
    tasks,
    vendors: overlayVendorState(base.vendors, parsed.vendors ?? []),
    vendorVisits: parsed.vendorVisits ?? base.vendorVisits,
  };
}

function geoFromSelection(locationMode: LocationMode, live: LiveFix | null) {
  if (locationMode !== "gps") {
    const preset = LOCATION_PRESETS.find((p) => p.id === locationMode);
    if (preset && preset.id !== "live") {
      return { lat: preset.lat, lng: preset.lng, accuracyM: 8 };
    }
  }
  if (live) return { lat: live.lat, lng: live.lng, accuracyM: live.accuracyM };
  return undefined;
}

export function toWhatsAppPhone(raw: string) {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(createInitialState);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [locationMode, setLocationMode] = useState<LocationMode>("gps");
  const [live, setLive] = useState<LiveFix | null>(null);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [gpsTick, setGpsTick] = useState(0);
  const [vendorsSync, setVendorsSync] = useState<{
    loading: boolean;
    live: boolean | null;
    at: string | null;
    error: string | null;
  }>({ loading: false, live: null, at: null, error: null });

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setState(mergeState(JSON.parse(raw) as Partial<AppState>));
      } catch {
        /* seed */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void AsyncStorage.setItem(KEY, JSON.stringify(state)).catch((error) => {
        console.warn("Could not save Camartes Field state", error);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [state, ready]);

  const refreshVendors = useCallback(async () => {
    setVendorsSync((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await fetchCamartesVendors();
      setState((s) => ({ ...s, vendors: overlayVendorState(result.vendors, s.vendors) }));
      setVendorsSync({
        loading: false,
        live: result.live,
        at: result.fetchedAt,
        error: result.live ? null : "Showing last camartes.com snapshot (live refresh unavailable).",
      });
    } catch (e) {
      setVendorsSync({
        loading: false,
        live: false,
        at: null,
        error: e instanceof Error ? e.message : "Could not refresh camartes.com",
      });
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void refreshVendors();
  }, [ready, refreshVendors]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((n) => {
      setOnline(!!n.isConnected);
    });
    return unsub;
  }, []);

  const persistPing = useCallback((ping: LocationPing) => {
    setState((s) => {
      const last = s.pings[s.pings.length - 1];
      if (last && Math.abs(last.lat - ping.lat) < 0.00005 && Math.abs(last.lng - ping.lng) < 0.00005) {
        return s;
      }
      const tagged: LocationPing = {
        ...ping,
        activity: classifyActivity(ping, s.tasks, s.vendors),
      };
      return { ...s, pings: [...s.pings.slice(-400), tagged] };
    });
  }, []);

  const openShift = useMemo(() => state.shifts.find((s) => !s.clockOut) ?? null, [state.shifts]);

  const audit = useCallback((label: string) => {
    setState((s) => ({
      ...s,
      audit: [{ id: `au-${Date.now()}`, at: new Date().toISOString(), label }, ...s.audit].slice(0, 80),
    }));
  }, []);

  const queueIfOffline = useCallback(
    (label: string) => {
      if (online) return;
      setState((s) => ({
        ...s,
        offlineQueue: [
          { id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), label, synced: false },
          ...s.offlineQueue,
        ],
      }));
    },
    [online],
  );

  useEffect(() => {
    if (!ready || !state.userId) {
      return;
    }

    if (locationMode !== "gps") {
      const preset = LOCATION_PRESETS.find((p) => p.id === locationMode);
      if (!preset || preset.id === "live") return;
      const fix: LiveFix = {
        lat: preset.lat,
        lng: preset.lng,
        accuracyM: 8,
        source: "simulated",
        at: new Date().toISOString(),
      };
      setLive(fix);
      setGpsMessage(null);
      if (openShift) {
        persistPing({
          at: fix.at,
          lat: fix.lat,
          lng: fix.lng,
          accuracyM: fix.accuracyM,
          source: "simulated",
        });
      }
      return;
    }

    let cancelled = false;
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      setGpsMessage("Requesting device GPS…");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        setGpsMessage("GPS permission denied. Enable location for this site, or pick a hub pin.");
        return;
      }
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const fix: LiveFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy ?? 25,
          source: "gps",
          at: new Date().toISOString(),
        };
        setLive(fix);
        setGpsMessage(null);
        if (openShift) {
          persistPing({
            at: fix.at,
            lat: fix.lat,
            lng: fix.lng,
            accuracyM: fix.accuracyM,
            source: "gps",
          });
        }
      } catch {
        if (!cancelled) setGpsMessage("No GPS fix yet. Move outdoors, or pick a hub pin to simulate.");
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 5 },
        (pos) => {
          if (cancelled) return;
          const fix: LiveFix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy ?? 25,
            source: "gps",
            at: new Date().toISOString(),
          };
          setLive(fix);
          setGpsMessage(null);
          if (openShift) {
            persistPing({
              at: fix.at,
              lat: fix.lat,
              lng: fix.lng,
              accuracyM: fix.accuracyM,
              source: "gps",
            });
          }
        },
      );
      if (cancelled) sub?.remove();
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [locationMode, ready, state.userId, openShift, persistPing, gpsTick]);

  const cityManager = useMemo(() => {
    const point = live ?? { lat: BANJARA.geo.lat, lng: BANJARA.geo.lng };
    return nearestCityManager(point);
  }, [live]);

  const refreshGps = useCallback(() => {
    setLocationMode("gps");
    setGpsTick((n) => n + 1);
  }, []);

  const user = useMemo(() => USERS.find((u) => u.id === state.userId) ?? null, [state.userId]);

  const login = useCallback((email: string, password: string) => {
    const found = USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
    );
    if (!found) return "Email or password is incorrect.";
    const device = Platform.OS === "web" ? "web-demo" : `${Platform.OS}-bound`;
    setState((s) => ({
      ...s,
      userId: found.id,
      deviceBoundId: `${found.employeeId}:${device}`,
    }));
    return null;
  }, []);

  const logout = useCallback(() => {
    setState((s) => ({ ...s, userId: null }));
    setLive(null);
  }, []);

  const clockIn = useCallback(
    (opts?: {
      selfieUri?: string;
      overrideReason?: string;
      safetyHelmet?: boolean;
      safetyTwoWheeler?: boolean;
    }) => {
      if (state.shifts.some((sh) => !sh.clockOut)) return "Already on shift.";
      if (!opts?.safetyHelmet || !opts?.safetyTwoWheeler) {
        return "safety";
      }
      if (!opts?.selfieUri && Platform.OS !== "web") {
        /* selfie encouraged; web demo may skip */
      }
      const now = new Date();
      const geo = geoFromSelection(locationMode, live);
      const gate = evaluateShiftClockIn({
        geo: geo ?? null,
        now,
        tasks: state.tasks,
        roster: ROSTER,
        overrideReason: opts?.overrideReason,
      });
      if (!gate.allowed) {
        return "geofence";
      }
      const geofenceOk = gate.via !== "override";
      const shift: Shift = {
        id: `sh-${now.getTime()}`,
        date: format(now, "yyyy-MM-dd"),
        clockIn: now.toISOString(),
        clockInGeo: geo,
        selfieUri: opts?.selfieUri,
        geofenceOk,
        geofenceOverride: gate.via === "override" ? opts?.overrideReason : undefined,
        safetyHelmet: true,
        safetyTwoWheeler: true,
      };
      setState((s) => ({ ...s, shifts: [...s.shifts, shift] }));
      if (geo) {
        setLive({
          lat: geo.lat,
          lng: geo.lng,
          accuracyM: geo.accuracyM ?? 8,
          source: locationMode === "gps" ? "gps" : "simulated",
          at: now.toISOString(),
        });
      }
      queueIfOffline("Clock in");
      const viaLabel =
        gate.via === "first_task"
          ? `within 5 km of first stop${gate.firstTask ? ` ${gate.firstTask.id}` : ""}${gate.kmToFirst != null ? ` (${formatKm(gate.kmToFirst)})` : ""}`
          : gate.via === "roster"
            ? `roster login ${gate.rosterWindow ?? ""}`.trim()
            : `override: ${opts?.overrideReason}`;
      audit(`Clock in · ${viaLabel} · ${user?.employeeId}`);
      return null;
    },
    [state.shifts, state.tasks, live, locationMode, queueIfOffline, audit, user?.employeeId],
  );

  const clockOut = useCallback(() => {
    setState((s) => ({
      ...s,
      shifts: s.shifts.map((sh) =>
        sh.clockOut
          ? sh
          : {
              ...sh,
              clockOut: new Date().toISOString(),
              clockOutGeo: geoFromSelection(locationMode, live),
            },
      ),
    }));
    queueIfOffline("Clock out");
    audit("Clock out");
  }, [live, locationMode, queueIfOffline, audit]);

  const requestOt = useCallback(() => {
    setState((s) => ({
      ...s,
      shifts: s.shifts.map((sh) => (!sh.clockOut ? { ...sh, otRequested: true } : sh)),
    }));
    queueIfOffline("Overtime request");
    audit("Overtime requested for current shift");
  }, [queueIfOffline, audit]);

  const updateTask = useCallback((id: string, patch: Partial<FieldTask>) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const assignTask = useCallback(
    (taskId: string, assigneeId: string) => {
      const assignee = USERS.find((person) => person.id === assigneeId);
      if (!assignee) return;
      const at = new Date().toISOString();
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                assigneeId,
                assignedAt: at,
                timeline: [
                  ...task.timeline,
                  {
                    id: `ev-${Date.now()}`,
                    at,
                    label: `Dispatch assigned to ${assignee.name}`,
                  },
                ],
              }
            : task,
        ),
      }));
      audit(`Dispatch assigned ${taskId} to ${assignee.employeeId}`);
    },
    [audit],
  );

  const addPhoto = useCallback((taskId: string, photo: GeoPhoto) => {
    setState((s) => {
      if (s.vendors.some((v) => v.id === taskId)) {
        return {
          ...s,
          vendors: s.vendors.map((v) =>
            v.id === taskId ? { ...v, photos: [...(v.photos ?? []), photo] } : v,
          ),
        };
      }
      return {
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                photos: [...t.photos, photo],
                timeline: [
                  ...t.timeline,
                  { id: `p-${photo.id}`, at: photo.geo.capturedAt, label: `Geotagged photo · ${photo.checkpoint}` },
                ],
              }
            : t,
        ),
      };
    });
    queueIfOffline(`Photo ${photo.checkpoint}`);
    audit(`Photo ${photo.checkpoint} on ${taskId}`);
  }, [queueIfOffline, audit]);

  const setTaskStatus = useCallback((id: string, status: TaskStatus, label: string) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              startedAt: t.startedAt ?? (status === "in_progress" ? new Date().toISOString() : t.startedAt),
              completedAt: status === "completed" ? new Date().toISOString() : t.completedAt,
              timeline: [...t.timeline, { id: `ev-${Date.now()}`, at: new Date().toISOString(), label }],
            }
          : t,
      ),
    }));
    queueIfOffline(label);
    audit(label);
  }, [queueIfOffline, audit]);

  const generateOtp = useCallback(
    (taskId: string) => {
      const pin = generateHandoverPin();
      const at = new Date().toISOString();
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === taskId ? { ...t, otpCode: pin, otpGeneratedAt: at, otpVerified: false } : t,
        ),
      }));
      audit(`In-app handover PIN generated on ${taskId}`);
      return pin;
    },
    [audit],
  );

  const verifyOtp = useCallback((taskId: string, code: string) => {
    const entered = code.trim();
    const task = state.tasks.find((t) => t.id === taskId);
    const generatedAt = task?.otpGeneratedAt ? Date.parse(task.otpGeneratedAt) : Number.NaN;
    const expired = !Number.isFinite(generatedAt) || Date.now() - generatedAt > HANDOVER_PIN_TTL_MS;
    if (!task?.otpCode || task.otpCode !== entered || expired) return false;
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, otpVerified: true, customerConfirmed: true } : t,
      ),
    }));
    queueIfOffline(`Handover PIN ${taskId}`);
    audit(`In-app OTP confirmed on ${taskId}`);
    return true;
  }, [state.tasks, queueIfOffline, audit]);

  const matchSerial = useCallback((taskId: string, serial: string) => {
    const task = state.tasks.find((t) => t.id === taskId);
    const typed = serial.trim().toLowerCase();
    if (!task || !typed) return false;
    const hit = task.items.find((i) => {
      const s = i.serial.toLowerCase();
      if (s === typed) return true;
      const last4 = s.replace(/[^a-z0-9]/g, "").slice(-4);
      const typed4 = typed.replace(/[^a-z0-9]/g, "");
      return typed4.length === 4 && last4 === typed4;
    });
    if (!hit) return false;
    const next = Array.from(new Set([...(task.scannedSerials ?? []), hit.serial]));
    updateTask(taskId, { scannedSerials: next });
    queueIfOffline(`Serial match ${taskId}`);
    audit(`Serial ${hit.serial} matched on ${taskId}`);
    return true;
  }, [state.tasks, updateTask, queueIfOffline, audit]);

  const checkInTask = useCallback(
    (taskId: string) => {
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return "Task not found.";
      if (
        (task.kind === "delivery" || task.kind === "return") &&
        task.storeCheckedInAt &&
        task.customerCheckedInAt
      ) {
        return "Both route stops are already checked in.";
      }
      const geo = geoFromSelection(locationMode, live);
      if (!geo) return "No GPS fix.";
      const stage = nextCheckInStage(task);
      const target = checkInTarget(task);
      const km = haversineKm(geo, target);
      if (km > CHECK_IN_KM) {
        return `Too far (${formatKm(km)}). Move within ${Math.round(CHECK_IN_KM * 1000)} m of the stop.`;
      }
      const at = new Date().toISOString();
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                checkedInAt: at,
                checkedInGeo: geo,
                ...(stage === "store"
                  ? { storeCheckedInAt: at, storeCheckedInGeo: geo }
                  : { customerCheckedInAt: at, customerCheckedInGeo: geo }),
                status: t.status === "assigned" ? "in_progress" : t.status,
                startedAt: t.startedAt ?? at,
                timeline: [
                  ...t.timeline,
                  {
                    id: `ev-${Date.now()}`,
                    at,
                    label: `GPS check-in · ${stage === "store" ? "store" : "customer"} · ${formatKm(km)}`,
                  },
                ],
              }
            : t,
        ),
      }));
      queueIfOffline(`Check-in ${taskId}`);
      audit(`GPS check-in ${taskId}`);
      return null;
    },
    [state.tasks, locationMode, live, queueIfOffline, audit],
  );

  const logAttempt = useCallback(
    (taskId: string, code: AttemptCode, note: string) => {
      const at = new Date().toISOString();
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: "blocked",
                attempts: [...(t.attempts ?? []), { at, code, note }],
                timeline: [
                  ...t.timeline,
                  { id: `ev-${Date.now()}`, at, label: `Failed attempt · ${ATTEMPT_LABELS[code]}` },
                ],
              }
            : t,
        ),
      }));
      queueIfOffline(`Attempt ${taskId} ${code}`);
      audit(`Failed attempt ${code} on ${taskId}`);
    },
    [queueIfOffline, audit],
  );

  const saveKitCondition = useCallback((taskId: string, which: "pickup" | "return", condition: KitCondition) => {
    updateTask(taskId, which === "pickup" ? { kitPickupCondition: condition } : { kitReturnCondition: condition });
    queueIfOffline(`Kit ${which} condition ${taskId}`);
    audit(`Kit ${which} condition ${condition.overall} on ${taskId}`);
  }, [updateTask, queueIfOffline, audit]);

  const saveSignature = useCallback((taskId: string, svg: string) => {
    updateTask(taskId, { signatureSvg: svg });
    queueIfOffline(`POD signature ${taskId}`);
    audit(`POD signature captured on ${taskId}`);
  }, [updateTask, queueIfOffline, audit]);

  const sendWhatsApp = useCallback(
    (taskId: string, kind: "eta" | "delivered" | "collected") => {
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;
      const phone = toWhatsAppPhone(task.customerPhone);
      const msg =
        kind === "eta"
          ? `Camartes: ${user?.name} (${user?.employeeId}) is about 20 min away for booking ${task.bookingRef}.`
          : kind === "delivered"
            ? `Camartes: kit for ${task.bookingRef} has been delivered. Thank you.`
            : `Camartes: return for ${task.bookingRef} has been collected.`;
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
      void Linking.openURL(url);
      updateTask(taskId, { whatsappSent: true });
      audit(`WhatsApp ${kind} to customer ${task.bookingRef}`);
    },
    [state.tasks, user, updateTask, audit],
  );

  const addDamage = useCallback(
    (report: Omit<DamageReport, "id" | "at">) => {
      const row: DamageReport = { ...report, id: `DM-${Date.now()}`, at: new Date().toISOString() };
      setState((s) => ({ ...s, damages: [row, ...s.damages] }));
      queueIfOffline(`Damage report ${report.taskId}`);
      audit(`Damage reported ${report.serial}`);
    },
    [queueIfOffline, audit],
  );

  const addExpense = useCallback((claim: Omit<ExpenseClaim, "id" | "status">) => {
    setState((s) => ({
      ...s,
      expenses: [
        { ...claim, id: `EX-${Date.now()}`, status: "submitted" },
        ...s.expenses,
      ],
    }));
    queueIfOffline(`Expense ₹${claim.amountInr}`);
    audit(`Expense ₹${claim.amountInr} submitted`);
  }, [queueIfOffline, audit]);

  const markTraining = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      training: s.training.map((tr) => (tr.id === id ? { ...tr, done: true } : tr)),
    }));
  }, []);

  const markNoticesRead = useCallback(() => {
    setState((s) => ({ ...s, notices: s.notices.map((n) => ({ ...n, read: true })) }));
  }, []);

  const triggerSos = useCallback(() => {
    const { manager, km } = cityManager;
    const dial = () => {
      audit(`Emergency call opened — ${manager.city} city manager ${manager.name} (${formatKm(km)})`);
      void Linking.openURL(`tel:${manager.phone.replace(/\s/g, "")}`);
    };
    Alert.alert(
      live ? "Call city manager?" : "GPS unavailable",
      live
        ? `${manager.name} is the nearest city manager (${formatKm(km)} away).\n${manager.phone}`
        : `The app cannot choose the nearest manager without GPS. Call the default ${manager.city} manager, ${manager.name}?\n${manager.phone}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Call", style: "destructive", onPress: dial },
      ],
    );
  }, [audit, cityManager, live]);

  const setLanguage = useCallback((language: Lang) => {
    setState((s) => ({ ...s, language }));
  }, []);

  const requestLeave = useCallback(
    (input: {
      type: LeaveType;
      from: string;
      to: string;
      days: number;
      reason: string;
    }) => {
      const req: LeaveRequest = {
        id: `LV-${Date.now()}`,
        ...input,
        status: "pending",
        submittedAt: new Date().toISOString(),
      };
      setState((s) => ({ ...s, leaves: [req, ...s.leaves] }));
      queueIfOffline(`Leave request ${input.from}`);
      audit(`Leave requested ${input.type} ${input.from}`);
    },
    [queueIfOffline, audit],
  );

  const reviewLeave = useCallback(
    (id: string, status: "approved" | "rejected") => {
      setState((s) => ({
        ...s,
        leaves: s.leaves.map((leave) => (leave.id === id ? { ...leave, status } : leave)),
      }));
      audit(`Leave ${id} ${status} by operations`);
    },
    [audit],
  );

  const reviewExpense = useCallback(
    (id: string, status: "approved" | "rejected") => {
      setState((s) => ({
        ...s,
        expenses: s.expenses.map((expense) => (expense.id === id ? { ...expense, status } : expense)),
      }));
      audit(`Expense ${id} ${status} by operations`);
    },
    [audit],
  );

  const logVendorVisit = useCallback(
    (input: {
      vendorId: string;
      outcome: VendorVisitOutcome;
      pitch: string;
      note: string;
      intel: VendorIntel;
      declineReason?: string;
      nextMeetingAt?: string;
      nextMeetingNote?: string;
      profile: {
        name: string;
        contact: string;
        phone: string;
        listing: VendorListing;
        serviceTypes: VendorKind[];
      };
    }) => {
      const vendor = state.vendors.find((v) => v.id === input.vendorId);
      if (!vendor) return { error: "Vendor not found." };
      const outcome = normalizeOutcome(input.outcome);
      if (!input.profile.name.trim()) return { error: "Outlet name is required." };
      if (!input.profile.contact.trim()) return { error: "Contact person is required." };
      const listing = input.profile.listing;
      const serviceTypes = clampServices(listing, input.profile.serviceTypes);
      if (!serviceTypes.length) return { error: "Select at least one service they offer." };
      if (outcome === "not_interested" && !input.declineReason?.trim()) {
        return { error: "Reason is mandatory when they are not interested." };
      }
      if (outcome === "need_time" || outcome === "follow_up") {
        if (!input.nextMeetingAt?.trim()) return { error: "Set the next meeting date when they need time or a follow-up." };
      }
      if (outcome !== "courtesy" && outcome !== "not_interested") {
        const missing = [
          !input.intel.gstin.trim() && "GSTIN",
          !input.intel.decisionMaker.trim() && "decision maker",
          !input.intel.competitor.trim() && "competitor",
          !input.intel.ownedKit.trim() && "owned kit",
          !input.intel.nextShootDate.trim() && "next shoot date",
        ].filter(Boolean);
        if (missing.length) return { error: `Must-ask incomplete: ${missing.join(", ")}.` };
      }
      const geo = live ? { lat: live.lat, lng: live.lng, accuracyM: live.accuracyM } : undefined;
      const onSite = vendor.geoApprox ? false : geo ? haversineKm(geo, vendor.geo) <= 0.4 : false;
      const visit: VendorVisit = {
        id: `VV-${Date.now()}`,
        vendorId: input.vendorId,
        at: new Date().toISOString(),
        outcome,
        pitch: input.pitch,
        note: input.note,
        geo,
        onSite,
      };
      const interest = interestFromOutcome(outcome, vendor.interest);
      const nextStatus = statusFromInterest(interest);
      const nextMeetingAt =
        outcome === "not_interested" || outcome === "onboarded"
          ? input.nextMeetingAt?.trim() || undefined
          : input.nextMeetingAt?.trim() || vendor.nextMeetingAt;
      const kind = primaryService(serviceTypes, listing);
      const partnerCode =
        outcome === "onboarded" ? vendor.partnerCode ?? `CM-VN-${String(Date.now()).slice(-6)}` : vendor.partnerCode;
      setState((s) => ({
        ...s,
        vendorVisits: [visit, ...s.vendorVisits],
        vendors: s.vendors.map((v) =>
          v.id === input.vendorId
            ? {
                ...v,
                name: input.profile.name.trim(),
                contact: input.profile.contact.trim(),
                phone: input.profile.phone.trim() || v.phone,
                listing,
                serviceTypes,
                kind,
                onboarding: true,
                interest,
                status: v.status === "onboarded" ? v.status : nextStatus,
                lastVisitedAt: visit.at,
                nextMeetingAt,
                nextMeetingNote: input.nextMeetingNote?.trim() || v.nextMeetingNote,
                partnerCode,
                gstin: input.intel.gstin || v.gstin,
                decisionMaker: input.intel.decisionMaker || v.decisionMaker,
                competitor: input.intel.competitor || v.competitor,
                ownedKit: input.intel.ownedKit || v.ownedKit,
                nextShootDate: input.intel.nextShootDate || v.nextShootDate,
                declineReason: input.declineReason?.trim() || v.declineReason,
              }
            : v,
        ),
        tasks: s.tasks.map((t) =>
          t.vendorId === input.vendorId && t.status !== "completed"
            ? {
                ...t,
                vendorOutcome: outcome,
                vendorIntel: input.intel,
                declineReason: input.declineReason?.trim() || t.declineReason,
                timeline: [
                  ...t.timeline,
                  { id: `ev-${Date.now()}`, at: visit.at, label: `Vendor visit · ${interest}` },
                ],
              }
            : t,
        ),
      }));
      audit(`Vendor visit ${input.profile.name.trim()} · ${interest}${onSite ? " · on site" : " · off site"}`);
      queueIfOffline(`Vendor visit ${input.profile.name.trim()}`);
      return { partnerCode: outcome === "onboarded" ? partnerCode : undefined };
    },
    [state.vendors, live, audit, queueIfOffline],
  );

  const onboardVendor = useCallback(
    (vendorId: string) => {
      const existing = state.vendors.find((v) => v.id === vendorId)?.partnerCode;
      const code = existing ?? `CM-VN-${String(Date.now()).slice(-6)}`;
      setState((s) => ({
        ...s,
        vendors: s.vendors.map((v) => {
          if (v.id !== vendorId) return v;
          return {
            ...v,
            status: "onboarded" as const,
            interest: "onboarded" as const,
            onboarding: true,
            partnerCode: v.partnerCode ?? code,
          };
        }),
      }));
      const vendor = state.vendors.find((v) => v.id === vendorId);
      queueIfOffline(`Onboard vendor ${vendor?.name ?? vendorId}`);
      audit(`Onboarded ${vendor?.name ?? vendorId} as ${code}`);
      return code;
    },
    [audit, queueIfOffline, state.vendors],
  );

  const addWalkInVendor = useCallback(
    (input: {
      name: string;
      contact: string;
      phone: string;
      area: string;
      address: string;
      listing: VendorListing;
      serviceTypes: VendorKind[];
    }) => {
      if (!input.name.trim() || !input.contact.trim()) return null;
      const listing = input.listing;
      const serviceTypes = clampServices(listing, input.serviceTypes);
      if (!serviceTypes.length) return null;
      const geo = live
        ? { lat: live.lat, lng: live.lng }
        : { lat: 17.4126, lng: 78.4483 };
      const vendor: Vendor = {
        id: `vn-walkin-${Date.now()}`,
        kind: primaryService(serviceTypes, listing),
        listing,
        source: "field",
        name: input.name.trim(),
        contact: input.contact.trim(),
        phone: input.phone.trim() || "—",
        address: input.address.trim() || input.area.trim() || "Hyderabad",
        area: input.area.trim() || "Hyderabad",
        city: "Hyderabad",
        geo,
        status: "prospect",
        interest: "to_meet",
        onboarding: true,
        serviceTypes,
        notes: "Walk-in logged by field executive for Camartes onboarding.",
        geoApprox: !live,
      };
      setState((s) => ({ ...s, vendors: [vendor, ...s.vendors] }));
      queueIfOffline(`Walk-in lead ${vendor.name}`);
      audit(`Walk-in onboarding lead ${vendor.name}`);
      return vendor.id;
    },
    [live, queueIfOffline, audit],
  );

  const resetDemo = useCallback(() => {
    const next = createInitialState();
    next.userId = state.userId;
    next.language = state.language;
    next.deviceBoundId = state.deviceBoundId;
    setState(next);
    void AsyncStorage.setItem(KEY, JSON.stringify(next));
  }, [state.userId, state.language, state.deviceBoundId]);

  const value: AppContextValue = {
    ready,
    online,
    user,
    state,
    live,
    locationMode,
    setLocationMode,
    setLanguage,
    login,
    logout,
    clockIn,
    checkInTask,
    logAttempt,
    saveKitCondition,
    saveSignature,
    clockOut,
    requestOt,
    openShift,
    updateTask,
    assignTask,
    addPhoto,
    setTaskStatus,
    verifyOtp,
    generateOtp,
    matchSerial,
    sendWhatsApp,
    addDamage,
    addExpense,
    markTraining,
    markNoticesRead,
    gpsMessage,
    refreshGps,
    cityManager,
    logVendorVisit,
    addWalkInVendor,
    onboardVendor,
    triggerSos,
    requestLeave,
    reviewLeave,
    reviewExpense,
    resetDemo,
    audit,
    refreshVendors,
    vendorsSync,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
