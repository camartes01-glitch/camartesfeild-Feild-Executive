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
import { GEOFENCE_KM, nearestHubKm } from "@/lib/geo";
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
} from "@/lib/types";

const KEY = "camartes-field-v2";

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
  matchSerial: (taskId: string, serial: string) => boolean;
  sendWhatsApp: (taskId: string, kind: "eta" | "delivered" | "collected") => void;
  addDamage: (report: Omit<DamageReport, "id" | "at">) => void;
  addExpense: (claim: Omit<ExpenseClaim, "id" | "status">) => void;
  markTraining: (id: string) => void;
  markNoticesRead: () => void;
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
};

const Ctx = createContext<AppContextValue | null>(null);

function mergeState(parsed: Partial<AppState>): AppState {
  const base = createInitialState();
  return { ...base, ...parsed, tasks: parsed.tasks ?? base.tasks };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(createInitialState);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [locationMode, setLocationMode] = useState<LocationMode>("gps");
  const [live, setLive] = useState<LiveFix | null>(null);

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

    if (!openShift) {
      return;
    }

    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 8 },
        (pos) => {
          const fix: LiveFix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy ?? 25,
            source: "gps",
            at: new Date().toISOString(),
          };
          setLive(fix);
          persistPing({
            at: fix.at,
            lat: fix.lat,
            lng: fix.lng,
            accuracyM: fix.accuracyM,
            source: "gps",
          });
        },
      );
    })();
    return () => sub?.remove();
  }, [locationMode, ready, state.userId, openShift, persistPing]);

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
      deviceBoundId: s.deviceBoundId ?? `${found.employeeId}:${device}`,
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
      const geo = live ? { lat: live.lat, lng: live.lng, accuracyM: live.accuracyM } : undefined;
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
      queueIfOffline("Clock in");
      audit(
        `Clock in ${geofenceOk ? "inside hub geofence" : `override: ${opts?.overrideReason}`} · ${user?.employeeId}`,
      );
      return null;
    },
    [state.shifts, live, queueIfOffline, audit, user?.employeeId],
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
              clockOutGeo: live
                ? { lat: live.lat, lng: live.lng, accuracyM: live.accuracyM }
                : undefined,
            },
      ),
    }));
    queueIfOffline("Clock out");
    audit("Clock out");
    setLive(null);
  }, [live, queueIfOffline, audit]);

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
    setState((s) => ({
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
    }));
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

  const verifyOtp = useCallback((taskId: string, code: string) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task?.otpCode || task.otpCode !== code.trim()) return false;
    updateTask(taskId, { otpVerified: true, customerConfirmed: true });
    audit(`OTP verified on ${taskId}`);
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
      const phone = task.customerPhone.replace(/\D/g, "").replace(/^0/, "");
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
    audit("SOS raised — hub manager notified");
    Alert.alert("SOS sent", "Hyderabad hub manager is being called.");
    void Linking.openURL("tel:+914048552100");
  }, [audit]);

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
    matchSerial,
    sendWhatsApp,
    addDamage,
    addExpense,
    markTraining,
    markNoticesRead,
    triggerSos,
    requestLeave,
    resetDemo,
    audit,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
