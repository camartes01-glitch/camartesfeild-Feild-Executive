"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { format } from "date-fns";
import { createInitialState, LOCATION_PRESETS, USERS } from "@/lib/seed";
import type {
  AppState,
  FieldTask,
  FieldUser,
  GeoPhoto,
  LeaveRequest,
  LeaveType,
  LocationPing,
  Shift,
  TaskStatus,
} from "@/lib/types";

const KEY = "camartes-field-v1";

type LocationMode = "gps" | string;

type LiveFix = {
  lat: number;
  lng: number;
  accuracyM: number;
  source: "gps" | "simulated";
  at: string;
};

type AppContextValue = {
  ready: boolean;
  user: FieldUser | null;
  state: AppState;
  live: LiveFix | null;
  locationMode: LocationMode;
  setLocationMode: (mode: LocationMode) => void;
  login: (email: string, password: string) => string | null;
  logout: () => void;
  clockIn: () => void;
  clockOut: () => void;
  openShift: Shift | null;
  updateTask: (id: string, patch: Partial<FieldTask>) => void;
  addPhoto: (taskId: string, photo: GeoPhoto) => void;
  setTaskStatus: (id: string, status: TaskStatus, label: string) => void;
  requestLeave: (input: {
    type: LeaveType;
    from: string;
    to: string;
    days: number;
    reason: string;
  }) => void;
  resetDemo: () => void;
};

const Ctx = createContext<AppContextValue | null>(null);

function loadState(): AppState {
  if (typeof window === "undefined") return createInitialState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as AppState;
    return { ...createInitialState(), ...parsed };
  } catch {
    return createInitialState();
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(createInitialState);
  const [ready, setReady] = useState(false);
  const [locationMode, setLocationMode] = useState<LocationMode>("gps");
  const [live, setLive] = useState<LiveFix | null>(null);

  useEffect(() => {
    setState(loadState());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [state, ready]);

  const persistPing = useCallback((ping: LocationPing) => {
    setState((s) => {
      const last = s.pings[s.pings.length - 1];
      if (
        last &&
        Math.abs(last.lat - ping.lat) < 0.00005 &&
        Math.abs(last.lng - ping.lng) < 0.00005
      ) {
        return s;
      }
      return { ...s, pings: [...s.pings.slice(-400), ping] };
    });
  }, []);

  useEffect(() => {
    if (!ready || !state.userId) return;

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
      persistPing({
        at: fix.at,
        lat: fix.lat,
        lng: fix.lng,
        accuracyM: fix.accuracyM,
        source: "simulated",
      });
      return;
    }

    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const fix: LiveFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy || 25,
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
      () => {
        /* keep last fix */
      },
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 12000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [locationMode, ready, state.userId, persistPing]);

  const user = useMemo(
    () => USERS.find((u) => u.id === state.userId) ?? null,
    [state.userId],
  );

  const openShift = useMemo(
    () => state.shifts.find((s) => !s.clockOut) ?? null,
    [state.shifts],
  );

  const login = useCallback((email: string, password: string) => {
    const found = USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
    );
    if (!found) return "Email or password is incorrect.";
    setState((s) => ({ ...s, userId: found.id }));
    return null;
  }, []);

  const logout = useCallback(() => {
    setState((s) => ({ ...s, userId: null }));
    setLive(null);
  }, []);

  const clockIn = useCallback(() => {
    setState((s) => {
      if (s.shifts.some((sh) => !sh.clockOut)) return s;
      const now = new Date();
      const shift: Shift = {
        id: `sh-${now.getTime()}`,
        date: format(now, "yyyy-MM-dd"),
        clockIn: now.toISOString(),
        clockInGeo: live
          ? { lat: live.lat, lng: live.lng, accuracyM: live.accuracyM }
          : undefined,
      };
      return { ...s, shifts: [...s.shifts, shift] };
    });
  }, [live]);

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
  }, [live]);

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
                {
                  id: `p-${photo.id}`,
                  at: photo.geo.capturedAt,
                  label: `Geotagged photo · ${photo.checkpoint}`,
                },
              ],
            }
          : t,
      ),
    }));
  }, []);

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
              timeline: [
                ...t.timeline,
                { id: `ev-${Date.now()}`, at: new Date().toISOString(), label },
              ],
            }
          : t,
      ),
    }));
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
    },
    [],
  );

  const resetDemo = useCallback(() => {
    const next = createInitialState();
    next.userId = state.userId;
    setState(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }, [state.userId]);

  const value: AppContextValue = {
    ready,
    user,
    state,
    live,
    locationMode,
    setLocationMode,
    login,
    logout,
    clockIn,
    clockOut,
    openShift,
    updateTask,
    addPhoto,
    setTaskStatus,
    requestLeave,
    resetDemo,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
