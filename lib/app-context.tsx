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
import { BANJARA, HITEC, createInitialState, LOCATION_PRESETS, USERS } from "@/lib/seed";
import { fetchCamartesVendors, overlayVendorState } from "@/lib/camartes-api";
import { generateHandoverPin } from "@/lib/otp";
import { nearestCityManager } from "@/lib/cities";
import { GEOFENCE_KM, formatKm, haversineKm, nearestHubKm } from "@/lib/geo";
import type {
  AppState,
  DamageReport,
  ExpenseClaim,
  FieldTask,
  FieldUser,
  GeoPhoto,
  Lang,
  LeaveRequest,
  LeaveType,
  LocationPing,
  Shift,
  TaskStatus,
  Vendor,
  VendorVisit,
  VendorVisitOutcome,
} from "@/lib/types";

const KEY = "camartes-field-v7";

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
  clockIn: (opts?: { selfieUri?: string; overrideReason?: string }) => string | null;
  clockOut: () => void;
  requestOt: () => void;
  openShift: Shift | null;
  updateTask: (id: string, patch: Partial<FieldTask>) => void;
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
    void AsyncStorage.setItem(KEY, JSON.stringify(state));
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
      const on = !!n.isConnected;
      setOnline(on);
      if (on) {
        setState((s) => ({
          ...s,
          offlineQueue: s.offlineQueue.map((q) => ({ ...q, synced: true })),
        }));
      }
    });
    return () => unsub();
  }, []);

  const persistPing = useCallback((ping: LocationPing) => {
    setState((s) => {
      const last = s.pings[s.pings.length - 1];
      if (last && Math.abs(last.lat - ping.lat) < 0.00005 && Math.abs(last.lng - ping.lng) < 0.00005) {
        return s;
      }
      return { ...s, pings: [...s.pings.slice(-400), ping] };
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
          { id: `q-${Date.now()}`, at: new Date().toISOString(), label, synced: false },
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
    (opts?: { selfieUri?: string; overrideReason?: string }) => {
      if (state.shifts.some((sh) => !sh.clockOut)) return "Already on shift.";
      if (!opts?.selfieUri && Platform.OS !== "web") {
        /* selfie encouraged; web demo may skip */
      }
      const now = new Date();
      const geo = geoFromSelection(locationMode, live);
      let geofenceOk = true;
      if (geo) {
        const km = nearestHubKm(geo, [BANJARA.geo, HITEC.geo]);
        geofenceOk = km <= GEOFENCE_KM;
      } else {
        geofenceOk = false;
      }
      if (!geofenceOk && !opts?.overrideReason?.trim()) {
        return "geofence";
      }
      const shift: Shift = {
        id: `sh-${now.getTime()}`,
        date: format(now, "yyyy-MM-dd"),
        clockIn: now.toISOString(),
        clockInGeo: geo,
        selfieUri: opts?.selfieUri,
        geofenceOk,
        geofenceOverride: opts?.overrideReason,
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
      audit(
        `Clock in ${geofenceOk ? "inside hub geofence" : `override: ${opts?.overrideReason}`} · ${user?.employeeId}`,
      );
      return null;
    },
    [state.shifts, live, locationMode, queueIfOffline, audit, user?.employeeId],
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
    audit("Overtime requested for current shift");
  }, [audit]);

  const updateTask = useCallback((id: string, patch: Partial<FieldTask>) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

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
      updateTask(taskId, { otpCode: pin, otpGeneratedAt: new Date().toISOString(), otpVerified: false });
      audit(`In-app handover PIN generated on ${taskId}`);
      return pin;
    },
    [updateTask, audit],
  );

  const verifyOtp = useCallback((taskId: string, code: string) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task?.otpCode || !task.otpGeneratedAt) return false;
    if (task.otpCode !== code.trim()) return false;
    updateTask(taskId, { otpVerified: true, customerConfirmed: true });
    audit(`In-app OTP confirmed on ${taskId}`);
    return true;
  }, [state.tasks, updateTask, audit]);

  const matchSerial = useCallback((taskId: string, serial: string) => {
    const task = state.tasks.find((t) => t.id === taskId);
    const hit = task?.items.find((i) => i.serial.toLowerCase() === serial.trim().toLowerCase());
    if (!hit) return false;
    const next = Array.from(new Set([...(task?.scannedSerials ?? []), hit.serial]));
    updateTask(taskId, { scannedSerials: next });
    audit(`Serial ${hit.serial} matched on ${taskId}`);
    return true;
  }, [state.tasks, updateTask, audit]);

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
      audit(`Damage reported ${report.serial}`);
    },
    [audit],
  );

  const addExpense = useCallback((claim: Omit<ExpenseClaim, "id" | "status">) => {
    setState((s) => ({
      ...s,
      expenses: [
        { ...claim, id: `EX-${Date.now()}`, status: "submitted" },
        ...s.expenses,
      ],
    }));
    audit(`Expense ₹${claim.amountInr} submitted`);
  }, [audit]);

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
    audit(`SOS raised — ${manager.city} city manager ${manager.name} (${formatKm(km)})`);
    Alert.alert(
      "SOS sent",
      `${manager.name}, ${manager.city} city manager, is being called.\n${manager.phone}`,
    );
    void Linking.openURL(`tel:${manager.phone.replace(/\s/g, "")}`);
  }, [audit, cityManager]);

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
      audit(`Leave requested ${input.type} ${input.from}`);
    },
    [audit],
  );

  const logVendorVisit = useCallback(
    (input: { vendorId: string; outcome: VendorVisitOutcome; pitch: string; note: string }) => {
      const vendor = state.vendors.find((v) => v.id === input.vendorId);
      if (!vendor) return "Vendor not found.";
      const geo = live ? { lat: live.lat, lng: live.lng, accuracyM: live.accuracyM } : undefined;
      const onSite = geo ? haversineKm(geo, vendor.geo) <= 0.4 : false;
      const visit: VendorVisit = {
        id: `VV-${Date.now()}`,
        vendorId: input.vendorId,
        at: new Date().toISOString(),
        outcome: input.outcome,
        pitch: input.pitch,
        note: input.note,
        geo,
        onSite,
      };
      const nextStatus: Vendor["status"] =
        input.outcome === "onboarded"
          ? "onboarded"
          : input.outcome === "declined"
            ? "declined"
            : input.outcome === "follow_up"
              ? "follow_up"
              : "visited";
      setState((s) => ({
        ...s,
        vendorVisits: [visit, ...s.vendorVisits],
        vendors: s.vendors.map((v) =>
          v.id === input.vendorId
            ? {
                ...v,
                status: v.status === "onboarded" ? v.status : nextStatus,
                partnerCode:
                  input.outcome === "onboarded" ? v.partnerCode ?? `CM-VN-${String(Date.now()).slice(-4)}` : v.partnerCode,
              }
            : v,
        ),
        tasks: s.tasks.map((t) =>
          t.vendorId === input.vendorId && t.status !== "completed"
            ? {
                ...t,
                vendorOutcome: input.outcome,
                timeline: [
                  ...t.timeline,
                  { id: `ev-${Date.now()}`, at: visit.at, label: `Vendor visit · ${input.outcome}` },
                ],
              }
            : t,
        ),
      }));
      audit(`Vendor visit ${vendor.name} · ${input.outcome}${onSite ? " · on site" : " · off site"}`);
      queueIfOffline(`Vendor visit ${vendor.name}`);
      return null;
    },
    [state.vendors, live, audit, queueIfOffline],
  );

  const onboardVendor = useCallback(
    (vendorId: string) => {
      const code = `CM-VN-${String(Date.now()).slice(-4)}`;
      setState((s) => ({
        ...s,
        vendors: s.vendors.map((v) =>
          v.id === vendorId ? { ...v, status: "onboarded" as const, partnerCode: v.partnerCode ?? code } : v,
        ),
      }));
      const vendor = state.vendors.find((v) => v.id === vendorId);
      audit(`Onboarded ${vendor?.name ?? vendorId} as ${code}`);
      return code;
    },
    [audit, state.vendors],
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
    clockOut,
    requestOt,
    openShift,
    updateTask,
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
    onboardVendor,
    triggerSos,
    requestLeave,
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
