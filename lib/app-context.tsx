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
import { BANJARA, createEmptyOpsState, createInitialState, LOCATION_PRESETS, ROSTER, USERS } from "@/lib/seed";
import { fetchCamartesVendors, overlayVendorState } from "@/lib/camartes-api";
import { loginFieldOps, logoutFieldOps, restoreFieldOpsSession } from "@/lib/camartes-auth";
import { isDemoMode, matchDemoPassword } from "@/lib/demo-mode";
import {
  clearFieldOpsProbeCache,
  fetchFieldOpsSnapshot,
  fetchFieldOpsTeam,
  parseSnapshot,
  parseTeam,
  probeFieldOps,
  pushFieldOpsMutation,
} from "@/lib/field-ops-api";
import { buildTeamPresence } from "@/lib/team-presence";
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
  AuthSession,
  CreateTaskInput,
  FieldOpsMutation,
  Lang,
  LeaveRequest,
  LeaveType,
  LocationPing,
  OfflineItem,
  Shift,
  TaskStatus,
  Vendor,
  VendorIntel,
  VendorKind,
  VendorListing,
  VendorVisit,
  VendorVisitOutcome,
} from "@/lib/types";

const KEY = "camartes-field-v11";
const SESSION_KEY = "camartes-field-session-v1";
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
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
  isDemoMode: boolean;
  isOperations: boolean;
  authSource: AuthSession["user"]["source"] | null;
  directory: FieldUser[];
  fieldOpsAvailable: boolean | null;
  fieldOpsReason: string | null;
  createTask: (input: CreateTaskInput) => string | null;
  team: ReturnType<typeof buildTeamPresence>;
  myTasks: FieldTask[];
  myLeaves: LeaveRequest[];
  myExpenses: ExpenseClaim[];
  myShifts: Shift[];
  flushQueue: () => Promise<void>;
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
  addExpense: (claim: { date: string; km: number; amountInr: number; note: string }) => void;
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

function migrateOffline(items: OfflineItem[] | Array<Partial<OfflineItem>> | undefined): OfflineItem[] {
  return (items ?? []).map((item, index) => ({
    id: item.id ?? `q-${index}`,
    at: item.at ?? new Date().toISOString(),
    label: item.label ?? "Queued change",
    synced: !!item.synced,
    status: item.status ?? (item.synced ? "success" : "pending"),
    retries: item.retries ?? 0,
    lastRetryAt: item.lastRetryAt,
    lastError: item.lastError,
    idempotencyKey: item.idempotencyKey ?? item.id ?? `legacy-${index}`,
    op: item.op,
  }));
}

function mergeDemoState(parsed: Partial<AppState>): AppState {
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
    shifts: (parsed.shifts ?? base.shifts).map((shift) => ({
      ...shift,
      userId: shift.userId || "fe-rahul",
    })),
    leaves: (parsed.leaves ?? base.leaves).map((leave) => ({
      ...leave,
      userId: leave.userId || "fe-rahul",
      createdAt: leave.createdAt || leave.submittedAt,
    })),
    expenses: (parsed.expenses ?? base.expenses).map((expense) => ({
      ...expense,
      userId: expense.userId || "fe-rahul",
      createdAt: expense.createdAt || `${expense.date}T12:00:00+05:30`,
    })),
    offlineQueue: migrateOffline(parsed.offlineQueue ?? base.offlineQueue),
    vendors: overlayVendorState(base.vendors, parsed.vendors ?? []),
    vendorVisits: parsed.vendorVisits ?? base.vendorVisits,
  };
}

function mergeCachedOpsState(parsed: Partial<AppState>): AppState {
  const base = createEmptyOpsState();
  return {
    ...base,
    ...parsed,
    tasks: parsed.tasks ?? [],
    shifts: parsed.shifts ?? [],
    leaves: parsed.leaves ?? [],
    expenses: parsed.expenses ?? [],
    pings: parsed.pings ?? [],
    damages: parsed.damages ?? [],
    audit: parsed.audit ?? [],
    offlineQueue: migrateOffline(parsed.offlineQueue ?? []),
    vendors: overlayVendorState(base.vendors, parsed.vendors ?? []),
    vendorVisits: parsed.vendorVisits ?? [],
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
  const [session, setSession] = useState<AuthSession | null>(null);
  const [people, setPeople] = useState<FieldUser[]>(USERS);
  const [fieldOpsAvailable, setFieldOpsAvailable] = useState<boolean | null>(null);
  const [fieldOpsReason, setFieldOpsReason] = useState<string | null>(null);
  const [vendorsSync, setVendorsSync] = useState<{
    loading: boolean;
    live: boolean | null;
    at: string | null;
    error: string | null;
  }>({ loading: false, live: null, at: null, error: null });

  useEffect(() => {
    (async () => {
      try {
        const [raw, sessionRaw] = await Promise.all([
          AsyncStorage.getItem(KEY),
          AsyncStorage.getItem(SESSION_KEY),
        ]);
        if (sessionRaw) {
          const parsed = JSON.parse(sessionRaw) as AuthSession;
          if (parsed?.user?.id && parsed.user.role) {
            setSession(parsed);
            if (parsed.user.source === "demo") {
              if (raw) setState(mergeDemoState(JSON.parse(raw) as Partial<AppState>));
            } else if (raw) {
              setState(mergeCachedOpsState(JSON.parse(raw) as Partial<AppState>));
            } else {
              setState(createEmptyOpsState());
            }
          } else if (raw) {
            setState(mergeDemoState(JSON.parse(raw) as Partial<AppState>));
          }
        } else if (raw) {
          setState(mergeDemoState(JSON.parse(raw) as Partial<AppState>));
        }
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

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      void AsyncStorage.removeItem(SESSION_KEY);
      return;
    }
    void AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)).catch(() => {
      /* ignore */
    });
  }, [session, ready]);

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
      if (
        last &&
        last.userId === ping.userId &&
        Math.abs(last.lat - ping.lat) < 0.00005 &&
        Math.abs(last.lng - ping.lng) < 0.00005
      ) {
        return s;
      }
      const tagged: LocationPing = {
        ...ping,
        activity: classifyActivity(ping, s.tasks, s.vendors),
      };
      return { ...s, pings: [...s.pings.slice(-400), tagged] };
    });
  }, []);

  const user = session?.user ?? null;
  const isOperations = user?.role === "operations_manager";
  const directory = useMemo(() => {
    if (!user || user.source === "demo") {
      const byId = new Map(USERS.map((person) => [person.id, person]));
      if (user) byId.set(user.id, user);
      return [...byId.values()];
    }
    const byId = new Map(people.map((person) => [person.id, person]));
    byId.set(user.id, user);
    return [...byId.values()];
  }, [people, user]);

  const openShift = useMemo(
    () => state.shifts.find((s) => s.userId === user?.id && !s.clockOut) ?? null,
    [state.shifts, user?.id],
  );

  const audit = useCallback((label: string) => {
    setState((s) => ({
      ...s,
      audit: [{ id: `au-${Date.now()}`, at: new Date().toISOString(), label }, ...s.audit].slice(0, 80),
    }));
  }, []);

  const enqueue = useCallback((label: string, op?: FieldOpsMutation) => {
    const idempotencyKey =
      op?.type === "create_task"
        ? `create_task:${op.payload.id}`
        : op?.type === "assign_task"
          ? `assign_task:${op.payload.taskId}:${op.payload.assigneeId}:${op.payload.assignedAt}`
          : op?.type === "set_task_status"
            ? `set_task_status:${op.payload.taskId}:${op.payload.status}`
            : op?.type === "clock_in"
              ? `clock_in:${op.payload.id}`
              : op?.type === "clock_out"
                ? `clock_out:${op.payload.shiftId}:${op.payload.clockOut}`
                : op?.type === "request_leave"
                  ? `request_leave:${op.payload.id}`
                  : op?.type === "review_leave"
                    ? `review_leave:${op.payload.id}:${op.payload.status}`
                    : op?.type === "add_expense"
                      ? `add_expense:${op.payload.id}`
                      : op?.type === "review_expense"
                        ? `review_expense:${op.payload.id}:${op.payload.status}`
                        : `evt:${Date.now()}`;
    const row: OfflineItem = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      label,
      synced: false,
      status: "pending",
      retries: 0,
      idempotencyKey,
      op,
    };
    setState((s) => {
      if (s.offlineQueue.some((item) => item.idempotencyKey === idempotencyKey && item.status !== "failed")) {
        return s;
      }
      return { ...s, offlineQueue: [row, ...s.offlineQueue].slice(0, 200) };
    });
  }, []);

  useEffect(() => {
    if (!ready || !user?.id) {
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
          userId: user?.id,
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
            userId: user?.id,
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
              userId: user?.id,
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
  }, [locationMode, ready, user?.id, openShift, persistPing, gpsTick]);

  const cityManager = useMemo(() => {
    const point = live ?? { lat: BANJARA.geo.lat, lng: BANJARA.geo.lng };
    return nearestCityManager(point);
  }, [live]);

  const refreshGps = useCallback(() => {
    setLocationMode("gps");
    setGpsTick((n) => n + 1);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const trimmed = email.trim();
    const device = Platform.OS === "web" ? "web-demo" : `${Platform.OS}-bound`;
    const applyUser = (next: FieldUser, token: string | null) => {
      setSession({ user: next, token });
    };

    if (isDemoMode() && matchDemoPassword(trimmed, password)) {
      const found = USERS.find((person) => person.email.toLowerCase() === trimmed.toLowerCase());
      if (found) {
        applyUser(found, null);
        setPeople(USERS);
        setState((s) => ({ ...mergeDemoState(s), userId: found.id, deviceBoundId: `${found.employeeId}:${device}` }));
        return null;
      }
    }

    const remote = await loginFieldOps(trimmed, password);
    if (remote.ok) {
      clearFieldOpsProbeCache();
      applyUser(remote.session.user, remote.session.token);
      setPeople([remote.session.user]);
      setState((s) => ({
        ...createEmptyOpsState(),
        language: s.language,
        vendors: s.vendors,
        userId: remote.session.user.id,
        deviceBoundId: `${remote.session.user.employeeId}:${device}`,
        offlineQueue: s.offlineQueue.filter((item) => item.status === "pending"),
      }));
      return null;
    }
    return remote.error;
  }, []);

  const logout = useCallback(() => {
    const token = session?.token ?? null;
    setSession(null);
    setPeople(USERS);
    setState((s) => ({ ...s, userId: null }));
    setLive(null);
    void logoutFieldOps(token);
  }, [session?.token]);

  const hydrateFromBackend = useCallback(
    async (token: string) => {
      const probe = await probeFieldOps();
      setFieldOpsAvailable(probe.available);
      setFieldOpsReason(probe.available ? null : probe.reason);
      if (!probe.available) return;

      const snapRes = await fetchFieldOpsSnapshot(token);
      if (!snapRes.ok) {
        if (snapRes.status === 401) {
          logout();
          setFieldOpsReason("Session expired. Sign in again.");
          return;
        }
        setFieldOpsAvailable(false);
        setFieldOpsReason(snapRes.error);
        return;
      }

      const teamRes = await fetchFieldOpsTeam(token);
      if (!teamRes.ok && teamRes.status === 401) {
        logout();
        setFieldOpsReason("Session expired. Sign in again.");
        return;
      }
      const teamPeople = teamRes.ok ? parseTeam(teamRes.body) : [];

      setState((s) => {
        const parsed = parseSnapshot(snapRes.body, { tasks: s.tasks, shifts: s.shifts });
        return {
          ...s,
          tasks: parsed.tasks,
          shifts: parsed.shifts,
          leaves: parsed.leave_requests,
          expenses: parsed.expenses,
        };
      });
      const parsed = parseSnapshot(snapRes.body);
      const scoped = teamPeople.length ? teamPeople : parsed.scoped_team;
      setPeople((current) => {
        const byId = new Map(current.map((row) => [row.id, row]));
        if (parsed.principal) byId.set(parsed.principal.id, parsed.principal);
        for (const row of scoped) byId.set(row.id, row);
        return [...byId.values()];
      });
      if (parsed.principal) {
        setSession((current) =>
          current ? { ...current, user: { ...current.user, ...parsed.principal, source: "field_ops" } } : current,
        );
      }
      setFieldOpsAvailable(true);
      setFieldOpsReason(null);
    },
    [logout],
  );

  const clockIn = useCallback(
    (opts?: {
      selfieUri?: string;
      overrideReason?: string;
      safetyHelmet?: boolean;
      safetyTwoWheeler?: boolean;
    }) => {
      if (!user || user.role !== "field_executive") return "Only a field executive can clock in.";
      if (state.shifts.some((sh) => sh.userId === user.id && !sh.clockOut)) return "Already on shift.";
      if (!opts?.safetyHelmet || !opts?.safetyTwoWheeler) {
        return "safety";
      }
      const now = new Date();
      const geo = geoFromSelection(locationMode, live);
      const mine = state.tasks.filter((task) => task.assigneeId === user.id);
      const gate = evaluateShiftClockIn({
        geo: geo ?? null,
        now,
        tasks: mine,
        roster: ROSTER,
        overrideReason: opts?.overrideReason,
      });
      if (!gate.allowed) {
        return "geofence";
      }
      const geofenceOk = gate.via !== "override";
      const shift: Shift = {
        id: `sh-${user.id}-${now.getTime()}`,
        userId: user.id,
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
      enqueue("Clock in", { type: "clock_in", payload: shift });
      const viaLabel =
        gate.via === "first_task"
          ? `within 5 km of first stop${gate.firstTask ? ` ${gate.firstTask.id}` : ""}${gate.kmToFirst != null ? ` (${formatKm(gate.kmToFirst)})` : ""}`
          : gate.via === "roster"
            ? `roster login ${gate.rosterWindow ?? ""}`.trim()
            : `override: ${opts?.overrideReason}`;
      audit(`Clock in · ${viaLabel} · ${user.employeeId}`);
      return null;
    },
    [state.shifts, state.tasks, live, locationMode, enqueue, audit, user],
  );

  const clockOut = useCallback(() => {
    if (!user) return;
    const now = new Date().toISOString();
    const current = state.shifts.find((sh) => sh.userId === user.id && !sh.clockOut);
    setState((s) => ({
      ...s,
      shifts: s.shifts.map((sh) =>
        sh.userId === user.id && !sh.clockOut
          ? {
              ...sh,
              clockOut: now,
              clockOutGeo: geoFromSelection(locationMode, live),
            }
          : sh,
      ),
    }));
    if (current) enqueue("Clock out", { type: "clock_out", payload: { shiftId: current.id, clockOut: now } });
    audit("Clock out");
  }, [live, locationMode, enqueue, audit, user, state.shifts]);

  const requestOt = useCallback(() => {
    setState((s) => ({
      ...s,
      shifts: s.shifts.map((sh) => (!sh.clockOut && sh.userId === user?.id ? { ...sh, otRequested: true } : sh)),
    }));
    enqueue("Overtime request");
    audit("Overtime requested for current shift");
  }, [enqueue, audit]);

  const updateTask = useCallback((id: string, patch: Partial<FieldTask>) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const assignTask = useCallback(
    (taskId: string, assigneeId: string) => {
      if (user?.role !== "operations_manager") return;
      const assignee = directory.find((person) => person.id === assigneeId);
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
                status: task.status === "completed" ? task.status : task.status === "blocked" ? task.status : "assigned",
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
      enqueue(`Dispatch assigned ${taskId}`, {
        type: "assign_task",
        payload: { taskId, assigneeId, assignedAt: at },
      });
      audit(`Dispatch assigned ${taskId} to ${assignee.employeeId}`);
    },
    [audit, directory, enqueue, user?.role],
  );

  const createTask = useCallback(
    (input: CreateTaskInput) => {
      if (user?.role !== "operations_manager") return "Only operations can create tasks.";
      if (!input.title.trim()) return "Title is required.";
      if (!input.dueAt.trim()) return "Due date is required.";
      const nums = state.tasks
        .map((task) => Number(String(task.id).replace(/\D/g, "")))
        .filter((n) => Number.isFinite(n) && n > 0);
      const id = `TSK-${Math.max(5000, ...nums, 0) + 1}`;
      const at = new Date().toISOString();
      const area = input.area.trim() || "Hyderabad";
      const vendor = input.vendorId ? state.vendors.find((row) => row.id === input.vendorId) : undefined;
      const customerName = input.customerName.trim() || vendor?.name || "Customer";
      const place = {
        id: `place-${id}`,
        name: customerName,
        address: input.address?.trim() || area,
        area,
        phone: input.customerPhone?.trim(),
        geo: vendor?.geo ?? BANJARA.geo,
      };
      const assignee = input.assigneeId ? directory.find((person) => person.id === input.assigneeId) : undefined;
      const task: FieldTask = {
        id,
        kind: input.kind,
        title: input.title.trim(),
        bookingRef: `BK-${id.replace("TSK-", "")}`,
        assigneeId: assignee?.id,
        assignedAt: assignee ? at : undefined,
        customerName,
        customerPhone: input.customerPhone?.trim() || vendor?.phone || "",
        status: assignee ? "assigned" : "unassigned",
        scheduledFor: input.dueAt,
        store: BANJARA,
        customerPlace: place,
        items: [],
        notes: input.description.trim(),
        photos: [],
        timeline: [
          {
            id: `ev-${Date.now()}`,
            at,
            label: assignee
              ? `Created by operations and assigned to ${assignee.name}`
              : "Created by operations · unassigned",
          },
        ],
        slaMinutes: 90,
        priority: input.priority,
        createdBy: user.id,
        createdAt: at,
        vendorId: vendor?.id,
      };
      setState((s) => ({ ...s, tasks: [task, ...s.tasks] }));
      enqueue(`Created ${id}`, { type: "create_task", payload: task });
      audit(`Created ${id}${assignee ? ` for ${assignee.employeeId}` : " (unassigned)"}`);
      return null;
    },
    [audit, directory, enqueue, state.tasks, state.vendors, user],
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
    enqueue(`Photo ${photo.checkpoint}`);
    audit(`Photo ${photo.checkpoint} on ${taskId}`);
  }, [enqueue, audit]);

  const setTaskStatus = useCallback((id: string, status: TaskStatus, label: string) => {
    const task = state.tasks.find((row) => row.id === id);
    if (!task) return;
    const allowed =
      user?.role === "operations_manager" || (user?.role === "field_executive" && task.assigneeId === user.id);
    if (!allowed) return;
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
    enqueue(label, { type: "set_task_status", payload: { taskId: id, status, label } });
    audit(label);
  }, [audit, enqueue, state.tasks, user]);

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
    enqueue(`Handover PIN ${taskId}`);
    audit(`In-app OTP confirmed on ${taskId}`);
    return true;
  }, [state.tasks, enqueue, audit]);

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
    enqueue(`Serial match ${taskId}`);
    audit(`Serial ${hit.serial} matched on ${taskId}`);
    return true;
  }, [state.tasks, updateTask, enqueue, audit]);

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
      enqueue(`Check-in ${taskId}`);
      audit(`GPS check-in ${taskId}`);
      return null;
    },
    [state.tasks, locationMode, live, enqueue, audit],
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
      enqueue(`Attempt ${taskId} ${code}`);
      audit(`Failed attempt ${code} on ${taskId}`);
    },
    [enqueue, audit],
  );

  const saveKitCondition = useCallback((taskId: string, which: "pickup" | "return", condition: KitCondition) => {
    updateTask(taskId, which === "pickup" ? { kitPickupCondition: condition } : { kitReturnCondition: condition });
    enqueue(`Kit ${which} condition ${taskId}`);
    audit(`Kit ${which} condition ${condition.overall} on ${taskId}`);
  }, [updateTask, enqueue, audit]);

  const saveSignature = useCallback((taskId: string, svg: string) => {
    updateTask(taskId, { signatureSvg: svg });
    enqueue(`POD signature ${taskId}`);
    audit(`POD signature captured on ${taskId}`);
  }, [updateTask, enqueue, audit]);

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
      enqueue(`Damage report ${report.taskId}`);
      audit(`Damage reported ${report.serial}`);
    },
    [enqueue, audit],
  );

  const addExpense = useCallback((claim: { date: string; km: number; amountInr: number; note: string }) => {
    if (!user) return;
    const row: ExpenseClaim = {
      ...claim,
      id: `EX-${Date.now()}`,
      userId: user.id,
      status: "submitted",
      createdAt: new Date().toISOString(),
    };
    setState((s) => ({ ...s, expenses: [row, ...s.expenses] }));
    enqueue(`Expense ₹${claim.amountInr}`, { type: "add_expense", payload: row });
    audit(`Expense ₹${claim.amountInr} submitted`);
  }, [enqueue, audit, user]);

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
      if (!user) return;
      const at = new Date().toISOString();
      const req: LeaveRequest = {
        id: `LV-${Date.now()}`,
        userId: user.id,
        ...input,
        status: "pending",
        submittedAt: at,
        createdAt: at,
      };
      setState((s) => ({ ...s, leaves: [req, ...s.leaves] }));
      enqueue(`Leave request ${input.from}`, { type: "request_leave", payload: req });
      audit(`Leave requested ${input.type} ${input.from}`);
    },
    [enqueue, audit, user],
  );

  const reviewLeave = useCallback(
    (id: string, status: "approved" | "rejected") => {
      if (user?.role !== "operations_manager") return;
      const at = new Date().toISOString();
      setState((s) => ({
        ...s,
        leaves: s.leaves.map((leave) =>
          leave.id === id ? { ...leave, status, reviewedAt: at, reviewedBy: user.id } : leave,
        ),
      }));
      enqueue(`Leave ${id} ${status}`, {
        type: "review_leave",
        payload: { id, status, reviewedAt: at, reviewedBy: user.id },
      });
      audit(`Leave ${id} ${status} by ${user.employeeId}`);
    },
    [audit, enqueue, user],
  );

  const reviewExpense = useCallback(
    (id: string, status: "approved" | "rejected") => {
      if (user?.role !== "operations_manager") return;
      const at = new Date().toISOString();
      setState((s) => ({
        ...s,
        expenses: s.expenses.map((expense) =>
          expense.id === id ? { ...expense, status, reviewedAt: at, reviewedBy: user.id } : expense,
        ),
      }));
      enqueue(`Expense ${id} ${status}`, {
        type: "review_expense",
        payload: { id, status, reviewedAt: at, reviewedBy: user.id },
      });
      audit(`Expense ${id} ${status} by ${user.employeeId}`);
    },
    [audit, enqueue, user],
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
      enqueue(`Vendor visit ${input.profile.name.trim()}`);
      return { partnerCode: outcome === "onboarded" ? partnerCode : undefined };
    },
    [state.vendors, live, audit, enqueue],
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
      enqueue(`Onboard vendor ${vendor?.name ?? vendorId}`);
      audit(`Onboarded ${vendor?.name ?? vendorId} as ${code}`);
      return code;
    },
    [audit, enqueue, state.vendors],
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
      enqueue(`Walk-in lead ${vendor.name}`);
      audit(`Walk-in onboarding lead ${vendor.name}`);
      return vendor.id;
    },
    [live, enqueue, audit],
  );

  const resetDemo = useCallback(() => {
    const next = createInitialState();
    next.userId = state.userId;
    next.language = state.language;
    next.deviceBoundId = state.deviceBoundId;
    setState(next);
    void AsyncStorage.setItem(KEY, JSON.stringify(next));
  }, [state.userId, state.language, state.deviceBoundId]);

  const flushQueue = useCallback(async () => {
    const pending = state.offlineQueue.filter((item) => item.status === "pending" && item.op);
    if (!pending.length) return;
    const probe = await probeFieldOps();
    setFieldOpsAvailable(probe.available);
    setFieldOpsReason(probe.available ? null : probe.reason);
    let anySuccess = false;
    let expired = false;
    for (const item of pending) {
      const result = await pushFieldOpsMutation(item, session?.token ?? null);
      if (result.ok) anySuccess = true;
      if (!result.ok && result.status === 401) expired = true;
      setState((s) => ({
        ...s,
        offlineQueue: s.offlineQueue.map((row) => {
          if (row.id !== item.id) return row;
          if (result.ok) return { ...row, synced: true, status: "success" as const, lastError: undefined };
          return {
            ...row,
            status: result.retryable ? ("pending" as const) : ("failed" as const),
            retries: (row.retries ?? 0) + 1,
            lastRetryAt: new Date().toISOString(),
            lastError: result.error,
          };
        }),
      }));
      if (expired) break;
    }
    if (expired) {
      logout();
      setFieldOpsReason("Session expired. Sign in again.");
      return;
    }
    if (anySuccess && session?.token && session.user.source !== "demo") {
      await hydrateFromBackend(session.token);
    }
  }, [hydrateFromBackend, logout, session?.token, session?.user.source, state.offlineQueue]);

  useEffect(() => {
    if (!ready) return;
    void probeFieldOps().then((probe) => {
      setFieldOpsAvailable(probe.available);
      setFieldOpsReason(probe.available ? null : probe.reason);
    });
  }, [ready]);

  useEffect(() => {
    if (!ready || !session?.token || session.user.source === "demo") return;
    let cancelled = false;
    (async () => {
      const restored = await restoreFieldOpsSession(session.token!);
      if (cancelled) return;
      if (!restored.ok) {
        if (restored.status === 401 || restored.status === 403) {
          logout();
          setFieldOpsReason(restored.error);
        } else {
          setFieldOpsAvailable(false);
          setFieldOpsReason(restored.error);
        }
        return;
      }
      setSession((current) => (current ? { ...current, user: restored.user } : current));
      await hydrateFromBackend(session.token!);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateFromBackend, logout, ready, session?.token, session?.user.source]);

  useEffect(() => {
    if (!ready || !online) return;
    const pending = state.offlineQueue.some((item) => item.status === "pending" && item.op);
    if (!pending) return;
    void flushQueue();
  }, [ready, online, state.offlineQueue, flushQueue]);

  const myTasks = useMemo(
    () =>
      isOperations
        ? state.tasks
        : state.tasks.filter((task) => !!user?.id && task.assigneeId === user.id),
    [isOperations, state.tasks, user?.id],
  );
  const myLeaves = useMemo(
    () => (isOperations ? state.leaves : state.leaves.filter((row) => row.userId === user?.id)),
    [isOperations, state.leaves, user?.id],
  );
  const myExpenses = useMemo(
    () => (isOperations ? state.expenses : state.expenses.filter((row) => row.userId === user?.id)),
    [isOperations, state.expenses, user?.id],
  );
  const myShifts = useMemo(
    () => (isOperations ? state.shifts : state.shifts.filter((row) => row.userId === user?.id)),
    [isOperations, state.shifts, user?.id],
  );
  const team = useMemo(
    () => buildTeamPresence(state, directory, user?.id, live),
    [directory, live, state, user?.id],
  );

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
    isDemoMode: isDemoMode(),
    isOperations,
    authSource: user?.source ?? null,
    directory,
    fieldOpsAvailable,
    fieldOpsReason,
    createTask,
    team,
    myTasks,
    myLeaves,
    myExpenses,
    myShifts,
    flushQueue,
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
