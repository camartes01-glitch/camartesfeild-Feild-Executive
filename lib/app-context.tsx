/**
 * App state for the Camartes Field Executive app.
 *
 * The Field Operations API is the source of truth. This provider:
 *  - holds the session (token rotation, expiry → sign-out),
 *  - runs the device GPS lifecycle (requested at sign-in; the shift trail runs only while
 *    the server confirms an open shift),
 *  - owns the offline queue: every field action is queued with an idempotency key and is
 *    shown as "pending" until the server confirms it,
 *  - caches read-only server data (home, task detail) for use offline.
 * It never computes SLA, radius, PIN or inventory decisions itself.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState as RNAppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { apiRequest, OPS, type ApiErr, type ApiResult } from "@/lib/ops-api";
import { readBase64, releaseMedia, type CapturedImage } from "@/lib/media-store";
import {
  applyResult,
  createItem,
  discard,
  enqueue as enqueueItem,
  markSyncing,
  nextEligible,
  pendingFor,
  belongsToOtherEmployee,
  recoverOnStart,
  retainOnSignOut,
  retryWithFreshFix,
  type Fix,
  summarize,
  withMediaIds,
  type NewQueueItem,
  type QueueItem,
  type QueueMedia,
} from "@/lib/sync-queue";
import { nearestManager } from "@/lib/field-ops";
import { isStaleFix } from "@/lib/geo";
import type {
  AppNotification,
  AuthSession,
  FailureCode,
  Home,
  KitGrade,
  Lang,
  OpsConfig,
  PartnerType,
  Principal,
  SosResult,
  TaskDetail,
  VisitStatus,
} from "@/lib/types";

const SESSION_KEY = "camartes-ops-session-v2";
const QUEUE_KEY = "camartes-ops-queue-v2";
const CACHE_KEY = "camartes-ops-cache-v2";
const LANG_KEY = "camartes-ops-lang-v1";
const TRAIL_KEY = "camartes-ops-trail-v1";
/** Principal id that owns the local queue and GPS trail on this device. */
const OWNER_KEY = "camartes-ops-owner-v1";
const TRAIL_BATCH = 10;
const TRAIL_FLUSH_MS = 5 * 60_000;
const REFRESH_BEFORE_MS = 2 * 60 * 60_000;

export type GpsStatus = "idle" | "requesting" | "denied" | "services_off" | "unavailable" | "inaccurate" | "ok";

export type LiveFix = { lat: number; lng: number; accuracyM: number; mocked: boolean; at: string };

type TrailPoint = { lat: number; lng: number; accuracyM: number; recordedAt: string; mocked?: boolean };

type Cache = { home: Home | null; tasks: Record<string, TaskDetail>; config: OpsConfig | null };

export type ActionResult = { ok: true; queued: boolean } | { ok: false; code: string; message: string };

/** The server's answer for a submitted form, never a guess. */
export type SubmitOutcome =
  | { state: "SYNCED"; serverId?: string }
  | { state: "QUEUED" } // offline or server unreachable: saved on this phone, syncs automatically
  | { state: "REJECTED"; code: string; message: string } // server refused it; nothing was saved
  | { state: "REFUSED"; code: string; message: string }; // not accepted on this phone (duplicate, queue full, no GPS)

export type SosOutcome = {
  manager: (Home["cityManagers"][number] | NonNullable<SosResult["manager"]>) | null;
  recorded: "SERVER" | "QUEUED";
  gpsRecorded: boolean;
  delivery: SosResult["delivery"] | null;
};

type CityManager = Home["cityManagers"][number];

type Ctx = {
  ready: boolean;
  online: boolean;
  user: Principal | null;
  token: string | null;
  isOperations: boolean;
  language: Lang;
  setLanguage: (lang: Lang) => void;
  authMessage: string | null;
  login: (email: string, password: string) => Promise<{ code: string; message: string } | null>;
  logout: (message?: string) => void;
  // GPS
  gpsStatus: GpsStatus;
  live: LiveFix | null;
  refreshGps: () => void;
  // Server data
  config: OpsConfig | null;
  home: Home | null;
  homeLoading: boolean;
  homeError: string | null;
  refreshHome: () => Promise<void>;
  task: (id: string) => TaskDetail | null;
  loadTask: (id: string) => Promise<ApiResult<TaskDetail>>;
  notifications: AppNotification[];
  refreshNotifications: () => Promise<boolean>;
  markNotificationsRead: () => Promise<boolean>;
  markNotificationRead: (id: string) => Promise<boolean>;
  // Queue
  queue: QueueItem[];
  queueSummary: ReturnType<typeof summarize>;
  pendingForTask: (taskId: string) => QueueItem[];
  syncNow: () => void;
  /** When the server last confirmed a queued step on this phone (this session). */
  lastSyncAt: number | null;
  retryQueued: (id: string) => void;
  discardQueued: (id: string) => void;
  // Shift
  clockIn: (input: { selfie: CapturedImage; overrideReason?: string }) => Promise<ApiResult<unknown>>;
  clockOut: () => ActionResult;
  // Task actions (queued)
  enRoute: (taskId: string) => ActionResult;
  arrived: (taskId: string) => ActionResult;
  checkIn: (taskId: string) => ActionResult;
  startTask: (taskId: string) => ActionResult;
  verifySerial: (taskId: string, itemId: string, last4: string) => ActionResult;
  recordKit: (taskId: string, itemId: string, grade: KitGrade, notes: string, photos: CapturedImage[]) => ActionResult;
  addPhoto: (taskId: string, checkpoint: string, image: CapturedImage) => ActionResult;
  capturePod: (taskId: string, recipientName: string, signaturePng: string) => ActionResult;
  completeTask: (taskId: string, lateReason?: string) => ActionResult;
  failTask: (taskId: string, code: FailureCode, notes: string, photos: CapturedImage[]) => ActionResult;
  retryTask: (taskId: string, reason: string) => ActionResult;
  // Online-only (the PIN is never stored or queued on the device)
  generatePin: (taskId: string) => Promise<ApiResult<{ pin?: string; sentTo?: string; delivery: "IN_APP_ONLY" | "WHATSAPP"; expiresAt: string; ttlMin: number }>>;
  verifyPin: (taskId: string, pin: string) => Promise<ApiResult<{ verified: boolean; attemptsLeft?: number }>>;
  // Onboarding
  saveVisit: (input: VisitInput) => Promise<SubmitOutcome>;
  updateVisit: (visitId: string, patch: Record<string, unknown>) => ActionResult;
  // HR
  requestLeave: (input: { type: string; from: string; to: string; reason: string }) => Promise<SubmitOutcome>;
  requestOvertime: (shiftId: string, reason: string) => ActionResult;
  queueAction: (input: { label: string; entityKey: string; path: string; body: Record<string, unknown> }) => ActionResult;
  submitTracked: (input: NewQueueItem) => Promise<SubmitOutcome>;
  // SOS
  sos: () => Promise<SosOutcome>;
  // Generic authorised GET (manager console, lists)
  get: <T>(path: string) => Promise<ApiResult<T>>;
  send: <T>(path: string, body: unknown, method?: "POST" | "PUT") => Promise<ApiResult<T>>;
};

export type VisitInput = {
  partnerId?: string;
  partnerType: PartnerType;
  businessName: string;
  contactPerson: string;
  phone: string;
  address: string;
  visitStatus: VisitStatus;
  gstAvailable: boolean | null;
  gstNumber: string;
  nextMeetingAt: string | null;
  notes: string;
  photos: CapturedImage[];
  /** Optional administrative location (village/town/locality) from the location picker. Validated server-side. */
  geoUnitId?: string | null;
};

const AppCtx = createContext<Ctx | null>(null);

function serverIdOf(body: unknown): string | undefined {
  return body && typeof body === "object" && "id" in body ? String((body as { id: unknown }).id) : undefined;
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  void AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [language, setLanguageState] = useState<Lang>("en");
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [live, setLive] = useState<LiveFix | null>(null);
  const [gpsTick, setGpsTick] = useState(0);
  const [cache, setCache] = useState<Cache>({ home: null, tasks: {}, config: null });
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const syncing = useRef(false);
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trail = useRef<{ points: TrailPoint[]; lastAt: number; lastFlush: number }>({ points: [], lastAt: 0, lastFlush: Date.now() });
  const liveRef = useRef<LiveFix | null>(null);

  const token = session?.token ?? null;
  const user = session?.user ?? null;
  const isOperations = user?.role === "operations_manager";

  // ── Boot ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [savedSession, savedQueue, savedCache, savedLang, savedTrail] = await Promise.all([
        loadJson<AuthSession | null>(SESSION_KEY, null),
        loadJson<QueueItem[]>(QUEUE_KEY, []),
        loadJson<Cache>(CACHE_KEY, { home: null, tasks: {}, config: null }),
        loadJson<Lang>(LANG_KEY, "en"),
        loadJson<TrailPoint[]>(TRAIL_KEY, []),
      ]);
      const recovered = recoverOnStart(savedQueue, Date.now());
      queueRef.current = recovered;
      setQueue(recovered);
      setCache(savedCache);
      setLanguageState(savedLang);
      trail.current.points = savedTrail;
      if (savedSession?.token) setSession(savedSession);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (session) saveJson(SESSION_KEY, session);
    else void AsyncStorage.removeItem(SESSION_KEY);
  }, [session, ready]);

  useEffect(() => {
    if (ready) saveJson(CACHE_KEY, cache);
  }, [cache, ready]);

  const commitQueue = useCallback((next: QueueItem[]) => {
    queueRef.current = next;
    setQueue(next);
    saveJson(QUEUE_KEY, next);
  }, []);

  useEffect(() => NetInfo.addEventListener((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false)), []);

  const setLanguage = useCallback((lang: Lang) => {
    setLanguageState(lang);
    saveJson(LANG_KEY, lang);
  }, []);

  // ── Auth ────────────────────────────────────────────────────────────────
  /** Replace the local work with `keep`. With nothing kept, the GPS trail and its owner go too. */
  const replaceLocalWork = useCallback(
    (keep: QueueItem[]) => {
      const kept = new Set(keep.map((q) => q.id));
      for (const q of queueRef.current) if (!kept.has(q.id)) q.media.forEach((m) => releaseMedia(m.ref));
      commitQueue(keep);
      if (!keep.length) {
        trail.current.points = [];
        void AsyncStorage.multiRemove([TRAIL_KEY, OWNER_KEY]).catch(() => undefined);
      }
    },
    [commitQueue],
  );

  /**
   * Sign out. An expired session keeps the employee's local work so they can sign back in and sync it.
   * A deliberate sign-out keeps only unsynced work (the employee confirmed it) and clears everything else.
   */
  const logout = useCallback(
    (message?: string, opts?: { keepLocalWork?: boolean }) => {
      const current = session?.token;
      if (current) void apiRequest(`/api/auth/logout`, { method: "POST", token: current });
      if (opts?.keepLocalWork) commitQueue(retainOnSignOut(queueRef.current)); // unsynced work, trail and owner stay
      else replaceLocalWork(retainOnSignOut(queueRef.current));
      setSession(null);
      setCache({ home: null, tasks: {}, config: null });
      setNotifications([]);
      setLive(null);
      setGpsStatus("idle");
      setAuthMessage(message ?? null);
    },
    [session?.token, replaceLocalWork, commitQueue],
  );

  const handleAuthFailure = useCallback(
    (result: ApiResult<unknown>) => {
      if (!result.ok && result.status === 401) {
        logout("Your session expired. Sign in again.", { keepLocalWork: true });
        return true;
      }
      return false;
    },
    [logout],
  );

  const login = useCallback(async (email: string, password: string) => {
    setAuthMessage(null);
    const res = await apiRequest<{ access_token: string; expires_at: string; principal: Principal }>(`/api/auth/login`, {
      body: { email_or_phone: email.trim(), password },
    });
    if (!res.ok) {
      if (res.status === 401) return { code: "BAD_CREDENTIALS", message: "Email or password is incorrect." };
      if (res.status === 429) return { code: "RATE_LIMITED", message: res.message };
      return { code: res.code, message: res.message };
    }
    const principal = res.body.principal;
    if (principal.role !== "field_executive" && principal.role !== "operations_manager") {
      return { code: "NOT_FIELD_EMPLOYEE", message: "This account is not a Camartes field operations employee." };
    }
    // Work left on this phone by another employee is never inherited.
    const owner = await AsyncStorage.getItem(OWNER_KEY).catch(() => null);
    if (belongsToOtherEmployee(owner, principal.id)) replaceLocalWork([]);
    void AsyncStorage.setItem(OWNER_KEY, principal.id).catch(() => undefined);
    setSession({ user: principal, token: res.body.access_token, expiresAt: res.body.expires_at });
    return null;
  }, [replaceLocalWork]);

  // Rotate the session token before it expires.
  useEffect(() => {
    if (!session?.expiresAt || !online) return;
    const due = Date.parse(session.expiresAt) - REFRESH_BEFORE_MS - Date.now();
    const timer = setTimeout(async () => {
      const res = await apiRequest<{ access_token: string; expires_at: string; principal: Principal }>(`/api/auth/refresh`, {
        method: "POST",
        token: session.token,
      });
      if (res.ok) setSession({ user: res.body.principal, token: res.body.access_token, expiresAt: res.body.expires_at });
      else handleAuthFailure(res);
    }, Math.max(0, due));
    return () => clearTimeout(timer);
  }, [session, online, handleAuthFailure]);

  const get = useCallback(
    async <T,>(path: string) => {
      const res = await apiRequest<T>(path, { token });
      handleAuthFailure(res);
      return res;
    },
    [token, handleAuthFailure],
  );

  const send = useCallback(
    async <T,>(path: string, body: unknown, method: "POST" | "PUT" = "POST") => {
      const res = await apiRequest<T>(path, { method, token, body, idempotencyKey: `web-${uid()}` });
      handleAuthFailure(res);
      return res;
    },
    [token, handleAuthFailure],
  );

  // ── Server reads ────────────────────────────────────────────────────────
  const refreshHome = useCallback(async () => {
    if (!token || isOperations) return;
    setHomeLoading(true);
    const [homeRes, configRes] = await Promise.all([
      apiRequest<Home>(`${OPS}/home`, { token }),
      cache.config ? Promise.resolve(null) : apiRequest<OpsConfig>(`${OPS}/config`, { token }),
    ]);
    setHomeLoading(false);
    if (handleAuthFailure(homeRes)) return;
    if (homeRes.ok) {
      setHomeError(null);
      setCache((c) => ({ ...c, home: homeRes.body, config: configRes && configRes.ok ? configRes.body : c.config }));
    } else {
      setHomeError(homeRes.message);
    }
  }, [token, isOperations, cache.config, handleAuthFailure]);

  const loadTask = useCallback(
    async (id: string) => {
      const res = await apiRequest<TaskDetail>(`${OPS}/tasks/${encodeURIComponent(id)}`, { token });
      handleAuthFailure(res);
      if (res.ok) setCache((c) => ({ ...c, tasks: { ...c.tasks, [id]: res.body } }));
      return res;
    },
    [token, handleAuthFailure],
  );

  const refreshNotifications = useCallback(async () => {
    if (!token) return false;
    const res = await apiRequest<{ notifications: AppNotification[] }>(`${OPS}/notifications`, { token });
    if (handleAuthFailure(res) || !res.ok) return false;
    setNotifications(res.body.notifications);
    return true;
  }, [token, handleAuthFailure]);

  // Only reflect "read" once the server has stored it.
  const markNotificationsRead = useCallback(async () => {
    if (!token) return false;
    const res = await apiRequest(`${OPS}/notifications/read`, { token, body: {} });
    if (handleAuthFailure(res) || !res.ok) return false;
    setNotifications((rows) => rows.map((n) => ({ ...n, read: true })));
    void refreshHome();
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, handleAuthFailure]);

  const markNotificationRead = useCallback(
    async (id: string) => {
      if (!token) return false;
      const res = await apiRequest(`${OPS}/notifications/read`, { token, body: { ids: [id] } });
      if (handleAuthFailure(res) || !res.ok) return false;
      setNotifications((rows) => rows.map((n) => (n.id === id ? { ...n, read: true } : n)));
      void refreshHome();
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, handleAuthFailure],
  );

  useEffect(() => {
    if (!token || isOperations) return;
    void refreshHome();
    void refreshNotifications();
    const timer = setInterval(() => {
      void refreshHome();
      void refreshNotifications();
    }, 60_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isOperations, online]);

  // Push registration (best effort; in-app notifications work without it).
  useEffect(() => {
    if (!token || Platform.OS === "web") return;
    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        const perm = await Notifications.requestPermissionsAsync();
        if (!perm.granted) return;
        const push = await Notifications.getExpoPushTokenAsync();
        await apiRequest(`${OPS}/devices`, { token, body: { token: push.data, platform: Platform.OS } });
      } catch {
        /* no EAS project id in dev builds — polling still delivers in-app notifications */
      }
    })();
  }, [token]);

  // ── GPS lifecycle ───────────────────────────────────────────────────────
  const openShiftId = cache.home?.shift?.id ?? null;
  const gpsIntervalMs = (cache.config?.rules.gpsPointIntervalS ?? 60) * 1000;
  const maxAccuracy = cache.config?.rules.maxGpsAccuracyM ?? 100;

  const enqueueRaw = useCallback(
    (input: NewQueueItem): boolean => {
      const item = createItem(input, Date.now());
      const result = enqueueItem(queueRef.current, item);
      if (result.accepted) commitQueue(result.queue);
      return result.accepted;
    },
    [commitQueue],
  );

  const flushTrail = useCallback(
    (shiftId: string | null, force = false) => {
      const buf = trail.current;
      if (!buf.points.length) return;
      if (!force && buf.points.length < TRAIL_BATCH && Date.now() - buf.lastFlush < TRAIL_FLUSH_MS) return;
      const points = buf.points.splice(0, cache.config?.rules.gpsBatchMax ?? 200);
      buf.lastFlush = Date.now();
      saveJson(TRAIL_KEY, buf.points);
      enqueueRaw({
        label: `GPS trail (${points.length} points)`,
        entityKey: "shift",
        path: `${OPS}/gps/points`,
        body: { shiftId, points },
        idempotencyKey: `gps:${shiftId ?? "open"}:${points[0].recordedAt}`,
      });
    },
    [enqueueRaw, cache.config?.rules.gpsBatchMax],
  );

  useEffect(() => {
    if (!ready || !token || isOperations) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | undefined;
    const onFix = (pos: Location.LocationObject) => {
      const fix: LiveFix = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy ?? 9999,
        mocked: Boolean(pos.mocked),
        at: new Date(pos.timestamp || Date.now()).toISOString(),
      };
      liveRef.current = fix;
      setLive(fix);
      setGpsStatus(fix.accuracyM > maxAccuracy ? "inaccurate" : "ok");
      // Shift trail: only while the server says a shift is open; throttled for battery.
      if (openShiftId && Date.now() - trail.current.lastAt >= gpsIntervalMs && fix.accuracyM <= maxAccuracy) {
        trail.current.lastAt = Date.now();
        trail.current.points.push({ lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM, recordedAt: fix.at, mocked: fix.mocked });
        saveJson(TRAIL_KEY, trail.current.points);
        flushTrail(openShiftId);
      }
    };
    (async () => {
      setGpsStatus("requesting");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        setGpsStatus("denied");
        return;
      }
      if (Platform.OS !== "web" && !(await Location.hasServicesEnabledAsync())) {
        setGpsStatus("services_off");
        return;
      }
      try {
        onFix(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      } catch {
        if (!cancelled) setGpsStatus("unavailable");
      }
      try {
        sub = await Location.watchPositionAsync(
          {
            accuracy: openShiftId ? Location.Accuracy.High : Location.Accuracy.Balanced,
            timeInterval: openShiftId ? 15_000 : 60_000,
            distanceInterval: openShiftId ? 20 : 100,
          },
          (pos) => !cancelled && onFix(pos),
        );
      } catch {
        if (!cancelled) setGpsStatus("unavailable");
      }
      if (cancelled) sub?.remove();
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [ready, token, isOperations, openShiftId, gpsIntervalMs, maxAccuracy, flushTrail, gpsTick]);

  const refreshGps = useCallback(() => setGpsTick((n) => n + 1), []);

  function fixBody(): Record<string, unknown> | null {
    const fix = liveRef.current;
    if (!fix) return null;
    return { lat: fix.lat, lng: fix.lng, accuracyM: Math.round(fix.accuracyM), mocked: fix.mocked, capturedAt: fix.at };
  }

  // ── Queue processor ─────────────────────────────────────────────────────
  const uploadMedia = useCallback(
    async (m: QueueMedia): Promise<ApiResult<{ mediaId: string }>> => {
      let data: string;
      try {
        data = await readBase64(m.ref);
      } catch {
        return { ok: false, status: 0, code: "MEDIA_MISSING", message: "The captured photo is no longer on this phone.", retryable: false };
      }
      return apiRequest<{ mediaId: string }>(`${OPS}/media/upload`, {
        token,
        body: { base64Data: data, contentType: m.contentType },
        idempotencyKey: m.idempotencyKey,
        timeoutMs: 60_000,
      });
    },
    [token],
  );

  const touchedTasks = useRef(new Set<string>());

  const processQueue = useCallback(async () => {
    if (syncing.current || !token || !online) return;
    syncing.current = true;
    try {
      for (let guard = 0; guard < 50; guard++) {
        const item = nextEligible(queueRef.current, Date.now());
        if (!item) break;
        commitQueue(markSyncing(queueRef.current, item.id));
        let result: ApiResult<unknown>;
        const ids: string[] = [];
        let mediaFailure: ApiErr | null = null;
        for (const m of item.media) {
          const up = await uploadMedia(m);
          if (!up.ok) {
            mediaFailure = up;
            break;
          }
          ids.push(up.body.mediaId);
        }
        if (mediaFailure) {
          result = mediaFailure;
        } else {
          result = await apiRequest(item.path, {
            method: item.method,
            token,
            body: withMediaIds(item.body, item.media, ids),
            idempotencyKey: item.idempotencyKey,
          });
        }
        if (!result.ok && result.status === 401) {
          commitQueue(applyResult(queueRef.current, item.id, { ok: false, retryable: true, code: "AUTH", message: result.message }, Date.now()));
          logout("Your session expired. Sign in again — queued work is kept.", { keepLocalWork: true });
          break;
        }
        // Trail batches rejected for business reasons (e.g. shift already closed) are dropped:
        // they must never block evidence for the rest of the shift.
        const dropTrail = !result.ok && !result.retryable && item.path.endsWith("/gps/points");
        commitQueue(
          dropTrail
            ? queueRef.current.filter((q) => q.id !== item.id)
            : applyResult(
                queueRef.current,
                item.id,
                result.ok
                  ? { ok: true, serverId: serverIdOf(result.body) }
                  : { ok: false, retryable: result.retryable, code: result.code, message: result.message },
                Date.now(),
              ),
        );
        if (result.ok) {
          item.media.forEach((m) => releaseMedia(m.ref));
          setLastSyncAt(Date.now());
        }
        if (item.entityKey.startsWith("task:")) touchedTasks.current.add(item.entityKey.slice(5));
        if (!result.ok && result.retryable) break; // connection trouble: stop and back off
      }
    } finally {
      syncing.current = false;
    }
    const touched = [...touchedTasks.current];
    touchedTasks.current.clear();
    await Promise.all(touched.map((id) => loadTask(id)));
    if (touched.length || queueRef.current.some((q) => q.entityKey === "shift")) void refreshHome();
    // Wake up again when the next retry is due.
    const nextDue = queueRef.current
      .filter((q) => q.status === "PENDING" || q.status === "RETRYING")
      .reduce((min, q) => Math.min(min, q.nextAttemptAt), Number.POSITIVE_INFINITY);
    if (wakeTimer.current) clearTimeout(wakeTimer.current);
    if (Number.isFinite(nextDue)) {
      wakeTimer.current = setTimeout(() => void processQueue(), Math.max(1_000, nextDue - Date.now()));
    }
  }, [token, online, commitQueue, uploadMedia, logout, loadTask, refreshHome]);

  useEffect(() => {
    if (ready && online && token) void processQueue();
  }, [ready, online, token, queue.length, processQueue]);

  useEffect(() => {
    const sub = RNAppState.addEventListener("change", (s) => {
      if (s === "active") void processQueue();
    });
    return () => sub.remove();
  }, [processQueue]);

  const syncNow = useCallback(() => {
    commitQueue(queueRef.current.map((q) => (q.status === "RETRYING" ? { ...q, nextAttemptAt: Date.now() } : q)));
    void processQueue();
  }, [commitQueue, processQueue]);

  const retryQueued = useCallback(
    (id: string) => {
      const fresh = liveRef.current && !isStaleFix(liveRef.current) ? fixBody() : null;
      commitQueue(retryWithFreshFix(queueRef.current, id, Date.now(), fresh as Fix | null, `retry:${uid()}`));
      void processQueue();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitQueue, processQueue],
  );

  const discardQueued = useCallback(
    (id: string) => {
      const item = queueRef.current.find((q) => q.id === id);
      item?.media.forEach((m) => releaseMedia(m.ref));
      commitQueue(discard(queueRef.current, id));
    },
    [commitQueue],
  );

  /**
   * Queue a form submission and wait (briefly) for the server's verdict, so the screen can show the real
   * record id or the real error. Offline, or if the server is unreachable, the work stays queued.
   * A server rejection removes the item so the employee can correct the form and submit again.
   */
  const submitTracked = useCallback(
    async (input: NewQueueItem, timeoutMs = 15_000): Promise<SubmitOutcome> => {
      const item = createItem(input, Date.now());
      const res = enqueueItem(queueRef.current, item);
      if (!res.accepted) {
        return res.reason === "DUPLICATE"
          ? { state: "REFUSED", code: "ALREADY_QUEUED", message: "This is already waiting to sync." }
          : { state: "REFUSED", code: "QUEUE_FULL", message: "Too much unsynced work on this phone. Connect to sync." };
      }
      commitQueue(res.queue);
      if (!online) return { state: "QUEUED" };
      void processQueue();
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
        const cur = queueRef.current.find((q) => q.id === item.id);
        if (!cur) return { state: "REJECTED", code: "DISCARDED", message: "The submission was discarded." };
        if (cur.status === "SYNCED") return { state: "SYNCED", serverId: cur.serverId };
        if (cur.status === "FAILED") {
          commitQueue(discard(queueRef.current, item.id));
          return { state: "REJECTED", code: cur.lastCode ?? "REJECTED", message: cur.lastError ?? "Rejected by the server." };
        }
        if (cur.status === "RETRYING") return { state: "QUEUED" };
      }
      return { state: "QUEUED" };
    },
    [online, commitQueue, processQueue],
  );

  // ── Actions ─────────────────────────────────────────────────────────────
  const taskAttempt = (taskId: string) => cache.tasks[taskId]?.attemptNo ?? 1;

  const queueTask = useCallback(
    (taskId: string, action: string, label: string, body: Record<string, unknown>, media: QueueMedia[] = [], unique = true): ActionResult => {
      const pending = pendingFor(queueRef.current, `task:${taskId}`);
      if (pending.some((q) => q.path.endsWith(`/${action}`) && q.status !== "FAILED")) {
        return { ok: false, code: "ALREADY_QUEUED", message: "This step is already waiting to sync." };
      }
      const accepted = enqueueRaw({
        label,
        entityKey: `task:${taskId}`,
        path: `${OPS}/tasks/${encodeURIComponent(taskId)}/${action}`,
        body,
        media,
        idempotencyKey: `${action}:${taskId}:a${taskAttempt(taskId)}${unique ? `:${uid()}` : ""}`,
      });
      return accepted ? { ok: true, queued: !online } : { ok: false, code: "QUEUE_FULL", message: "Too much unsynced work on this phone. Connect to sync." };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enqueueRaw, online, cache.tasks],
  );

  // Location-verified steps use a fresh fix taken when the employee taps (the server judges distance/accuracy;
  // an offline step keeps the time it was captured, so it is not re-judged by sync time).
  const needFix = (): ActionResult | null => {
    if (!liveRef.current) return { ok: false, code: "GPS_REQUIRED", message: "Waiting for a GPS fix." };
    if (!isStaleFix(liveRef.current)) return null;
    refreshGps(); // a stationary phone may not have reported for a while: ask for a fresh reading now
    return { ok: false, code: "GPS_STALE", message: "Your GPS reading is old. Getting a fresh one — try again in a moment." };
  };

  const mediaFor = (images: CapturedImage[], field: string, array: boolean): QueueMedia[] =>
    images.map((img) => ({ ref: img.ref, field, array, contentType: img.contentType, idempotencyKey: `media:${uid()}` }));

  const enRoute = (taskId: string) => queueTask(taskId, "en-route", "On the way", {});
  const arrived = (taskId: string) => queueTask(taskId, "arrived", "Arrived", fixBody() ?? {});
  const checkIn = (taskId: string) => needFix() ?? queueTask(taskId, "check-in", "GPS check-in", fixBody()!);
  const startTask = (taskId: string) => queueTask(taskId, "start", "Work started", {});
  const verifySerial = (taskId: string, itemId: string, last4: string) =>
    queueTask(taskId, "verify-serial", `Serial check ${last4}`, { itemId, last4 });
  const recordKit = (taskId: string, itemId: string, grade: KitGrade, notes: string, photos: CapturedImage[]) =>
    queueTask(taskId, "kit-condition", `Kit condition ${grade}`, { itemId, grade, notes }, mediaFor(photos, "photoMediaIds", true));
  const addPhoto = (taskId: string, checkpoint: string, image: CapturedImage) =>
    needFix() ??
    queueTask(taskId, "photos", `Photo · ${checkpoint}`, { checkpoint, ...fixBody()! }, mediaFor([image], "mediaId", false), true);
  const capturePod = (taskId: string, recipientName: string, signaturePng: string) =>
    needFix() ??
    queueTask(
      taskId,
      "pod",
      "POD signature",
      { recipientName, ...fixBody()! },
      [{ ref: signaturePng, field: "signatureMediaId", contentType: "image/png", idempotencyKey: `media:${uid()}` }],
    );
  const completeTask = (taskId: string, lateReason?: string) =>
    queueTask(taskId, "complete", "Complete task", { ...(fixBody() ?? {}), ...(lateReason ? { lateReason } : {}) });
  const failTask = (taskId: string, code: FailureCode, notes: string, photos: CapturedImage[]) =>
    needFix() ?? queueTask(taskId, "fail", `Failed attempt · ${code}`, { code, notes, ...fixBody()! }, mediaFor(photos, "photoMediaIds", true));
  const retryTask = (taskId: string, reason: string) => queueTask(taskId, "retry", "Retry scheduled", { reason });

  const generatePin = useCallback(
    async (taskId: string) => {
      const res = await apiRequest<{ pin?: string; sentTo?: string; delivery: "IN_APP_ONLY" | "WHATSAPP"; expiresAt: string; ttlMin: number }>(
        `${OPS}/tasks/${encodeURIComponent(taskId)}/handover-pin`,
        { method: "POST", token },
      );
      handleAuthFailure(res);
      return res;
    },
    [token, handleAuthFailure],
  );

  const verifyPin = useCallback(
    async (taskId: string, pin: string) => {
      const res = await apiRequest<{ verified: boolean; attemptsLeft?: number }>(
        `${OPS}/tasks/${encodeURIComponent(taskId)}/handover-pin/verify`,
        { token, body: { pin }, idempotencyKey: `pin-verify:${taskId}:${uid()}` },
      );
      handleAuthFailure(res);
      if (res.ok && res.body.verified) void loadTask(taskId);
      return res;
    },
    [token, handleAuthFailure, loadTask],
  );

  const clockIn = useCallback(
    async (input: { selfie: CapturedImage; overrideReason?: string }): Promise<ApiResult<unknown>> => {
      const fix = fixBody();
      if (!fix) return { ok: false, status: 0, code: "GPS_REQUIRED", message: "Waiting for a GPS fix.", retryable: false };
      if (isStaleFix(liveRef.current)) {
        refreshGps();
        return { ok: false, status: 0, code: "GPS_STALE", message: "Your GPS reading is old. Getting a fresh one — try again in a moment.", retryable: false };
      }
      if (!online) {
        return {
          ok: false,
          status: 0,
          code: "OFFLINE",
          message: "Clock-in needs a connection so your location can be verified.",
          retryable: true,
        };
      }
      const up = await uploadMedia({
        ref: input.selfie.ref,
        field: "selfieMediaId",
        contentType: input.selfie.contentType,
        idempotencyKey: `selfie:${uid()}`,
      });
      if (!up.ok) return up;
      const res = await apiRequest(`${OPS}/shifts/clock-in`, {
        token,
        body: {
          ...fix,
          selfieMediaId: up.body.mediaId,
          safety: { helmet: true, twoWheeler: true },
          overrideReason: input.overrideReason?.trim() || undefined,
        },
        idempotencyKey: `clock-in:${uid()}`,
      });
      handleAuthFailure(res);
      if (res.ok) {
        releaseMedia(input.selfie.ref);
        trail.current = { points: [], lastAt: 0, lastFlush: Date.now() };
        await refreshHome();
      }
      return res;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [online, token, uploadMedia, handleAuthFailure, refreshHome],
  );

  const clockOut = useCallback((): ActionResult => {
    const shiftId = cache.home?.shift?.id;
    if (!shiftId) return { ok: false, code: "NOT_CLOCKED_IN", message: "You are not clocked in." };
    flushTrail(shiftId, true);
    const accepted = enqueueRaw({
      label: "Clock out",
      entityKey: "shift",
      path: `${OPS}/shifts/clock-out`,
      body: { shiftId, ...(fixBody() ?? {}) },
      idempotencyKey: `clock-out:${shiftId}`,
    });
    return accepted ? { ok: true, queued: !online } : { ok: false, code: "ALREADY_QUEUED", message: "Clock-out is already waiting to sync." };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache.home?.shift?.id, flushTrail, enqueueRaw, online]);

  const saveVisit = async (input: VisitInput): Promise<SubmitOutcome> => {
    const fix = fixBody();
    if (!fix) return { state: "REFUSED", code: "GPS_REQUIRED", message: "Waiting for a GPS fix." };
    if (isStaleFix(liveRef.current)) {
      refreshGps();
      return { state: "REFUSED", code: "GPS_STALE", message: "Your GPS reading is old. Getting a fresh one — try again in a moment." };
    }
    const key = uid();
    return submitTracked({
      label: `Visit · ${input.businessName}`,
      entityKey: `onboard:${input.partnerId ?? key}`,
      path: `${OPS}/onboard/visits`,
      body: {
        partnerId: input.partnerId,
        partnerType: input.partnerType,
        businessName: input.businessName.trim(),
        contactPerson: input.contactPerson.trim(),
        phone: input.phone.trim(),
        address: input.address.trim(),
        visitStatus: input.visitStatus,
        gstAvailable: input.gstAvailable,
        gstNumber: input.gstNumber.trim().toUpperCase(),
        nextMeetingAt: input.nextMeetingAt,
        notes: input.notes.trim(),
        ...(input.geoUnitId ? { geoUnitId: input.geoUnitId } : {}),
        ...fix,
      },
      media: mediaFor(input.photos, "photoMediaIds", true),
      idempotencyKey: `visit:${key}`,
    });
  };

  const updateVisit = (visitId: string, patch: Record<string, unknown>): ActionResult => {
    const accepted = enqueueRaw({
      label: "Update visit",
      entityKey: `onboard-visit:${visitId}`,
      method: "PUT",
      path: `${OPS}/onboard/visits/${encodeURIComponent(visitId)}`,
      body: patch,
      idempotencyKey: `visit-update:${visitId}:${uid()}`,
    });
    return accepted ? { ok: true, queued: !online } : { ok: false, code: "QUEUE_FULL", message: "Queue full" };
  };

  const requestLeave = (input: { type: string; from: string; to: string; reason: string }) =>
    submitTracked({
      label: `Leave ${input.from} → ${input.to}`,
      entityKey: "hr",
      path: `${OPS}/leave`,
      body: input,
      idempotencyKey: `leave:${uid()}`,
    });

  const requestOvertime = (shiftId: string, reason: string): ActionResult => {
    const accepted = enqueueRaw({
      label: "Overtime request",
      entityKey: "hr",
      path: `${OPS}/hr/overtime`,
      body: { shiftId, reason },
      idempotencyKey: `overtime:${shiftId}`,
    });
    return accepted ? { ok: true, queued: !online } : { ok: false, code: "ALREADY_QUEUED", message: "Already requested." };
  };

  const queueAction = (input: { label: string; entityKey: string; path: string; body: Record<string, unknown> }): ActionResult => {
    const accepted = enqueueRaw({ ...input, idempotencyKey: `${input.entityKey}:${uid()}` });
    return accepted ? { ok: true, queued: !online } : { ok: false, code: "QUEUE_FULL", message: "Queue full" };
  };

  const sos = useCallback(async (): Promise<SosOutcome> => {
    const fix = fixBody();
    const body = fix ?? {};
    const key = `sos:${uid()}`;
    const managers = cache.home?.cityManagers ?? [];
    const local = nearestManager(liveRef.current, managers, cache.home?.employee.hubId ?? null);
    if (online) {
      const res = await apiRequest<SosResult>(`${OPS}/sos`, { token, body, idempotencyKey: key });
      if (res.ok) {
        return { manager: res.body.manager ?? local, recorded: "SERVER", gpsRecorded: res.body.gpsRecorded, delivery: res.body.delivery ?? null };
      }
    }
    // Offline (or the request failed): dial the nearest known manager now; the event syncs later. The same
    // idempotency key means a request that did reach the server is replayed, never raised twice.
    enqueueRaw({ label: "SOS", entityKey: key, path: `${OPS}/sos`, body, idempotencyKey: key });
    return { manager: local, recorded: "QUEUED", gpsRecorded: Boolean(fix), delivery: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, token, cache.home, enqueueRaw]);

  const value: Ctx = {
    ready,
    online,
    user,
    token,
    isOperations,
    language,
    setLanguage,
    authMessage,
    login,
    logout,
    gpsStatus,
    live,
    refreshGps,
    config: cache.config,
    home: cache.home,
    homeLoading,
    homeError,
    refreshHome,
    task: (id) => cache.tasks[id] ?? null,
    loadTask,
    notifications,
    refreshNotifications,
    markNotificationsRead,
    markNotificationRead,
    queue,
    queueSummary: useMemo(() => summarize(queue), [queue]),
    pendingForTask: (taskId) => pendingFor(queue, `task:${taskId}`),
    syncNow,
    lastSyncAt,
    retryQueued,
    discardQueued,
    clockIn,
    clockOut,
    enRoute,
    arrived,
    checkIn,
    startTask,
    verifySerial,
    recordKit,
    addPhoto,
    capturePod,
    completeTask,
    failTask,
    retryTask,
    generatePin,
    verifyPin,
    saveVisit,
    updateVisit,
    requestLeave,
    requestOvertime,
    queueAction,
    submitTracked,
    sos,
    get,
    send,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
