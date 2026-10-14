import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  CalendarCheck,
  CloudOff,
  LocateFixed,
  LocateOff,
  MapPinned,
  Package,
  PackageCheck,
  RefreshCw,
  Satellite,
  Store,
  Timer,
  TriangleAlert,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react-native";
import { Badge, type Tone } from "@/components/ui";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { clockOffsetMs, formatCountdown, slaView } from "@/lib/field-ops";
import { isStaleFix } from "@/lib/geo";
import { t, tk, type I18nKey } from "@/lib/i18n";
import type { Sla, Task, TaskKind, TaskState } from "@/lib/types";

export function useT() {
  const { language } = useApp();
  return useCallback((key: I18nKey, vars?: Record<string, string | number>) => t(language, key, vars), [language]);
}

export function useTk() {
  const { language } = useApp();
  return useCallback((key: string, fallback: string, vars?: Record<string, string | number>) => tk(language, key, fallback, vars), [language]);
}

/** Re-render every `ms` for live countdowns. */
export function useTick(ms = 30_000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** Subtle, always-visible connectivity + sync strip (offline state is never hidden). */
export function SyncBar() {
  const { online, queueSummary, syncNow } = useApp();
  const tr = useT();
  if (online && queueSummary.unsynced === 0) return null;
  const failed = queueSummary.failed > 0;
  const tone = !online ? styles.offline : failed ? styles.failed : styles.pending;
  const Icon = !online ? CloudOff : failed ? TriangleAlert : RefreshCw;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={tr("syncNow")} onPress={syncNow} style={[styles.bar, tone]}>
      <Icon size={15} color={colors.white} />
      <Text style={styles.barText} numberOfLines={1}>
        {!online ? tr("offline") : ""}
        {!online && queueSummary.unsynced ? " · " : ""}
        {queueSummary.pending + queueSummary.syncing ? tr("syncPending", { n: queueSummary.pending + queueSummary.syncing }) : ""}
        {queueSummary.failed ? ` · ${tr("syncFailed", { n: queueSummary.failed })}` : ""}
      </Text>
      {online ? <Text style={styles.barAction}>{tr("syncNow")}</Text> : null}
    </Pressable>
  );
}

/**
 * Compact GPS status: green when live, amber when degraded (weak/stale/still locating), red only when location
 * is blocked (permission off, services off, unavailable). Always says what to do; tap to retry.
 */
export function GpsLine() {
  const { gpsStatus, live, refreshGps, config } = useApp();
  const tr = useT();
  const [open, setOpen] = useState(false);
  useTick(15_000);
  const stale = !!live && isStaleFix(live);
  const text =
    stale && live
      ? tr("gpsStale", { min: Math.round((Date.now() - Date.parse(live.at)) / 60_000) })
      : gpsStatus === "ok" && live
        ? tr("gpsOk", { m: Math.round(live.accuracyM) })
        : gpsStatus === "inaccurate" && live
          ? tr("gpsInaccurate", { m: Math.round(live.accuracyM) })
          : gpsStatus === "denied"
            ? tr("gpsDenied")
            : gpsStatus === "services_off"
              ? tr("gpsServicesOff")
              : gpsStatus === "unavailable"
                ? tr("gpsUnavailable")
                : tr("gpsRequesting");
  const good = gpsStatus === "ok" && !stale;
  const blocked = gpsStatus === "denied" || gpsStatus === "services_off" || gpsStatus === "unavailable";
  const level = good ? "good" : blocked ? "blocked" : "degraded";
  const palette = level === "good" ? styles.gpsOk : level === "blocked" ? styles.gpsBad : styles.gpsWarn;
  const ink = level === "good" ? colors.successInk : level === "blocked" ? colors.dangerInk : colors.warningInk;
  const Icon = level === "good" ? LocateFixed : blocked ? LocateOff : Satellite;
  // Weak or missing GPS never blocks browsing; it only matters for location-verified steps.
  const hint = good ? null : tr("gpsWeakHint", { m: config?.rules.maxGpsAccuracyM ?? 100 });
  const locating = gpsStatus === "requesting" && !live;
  // Short pill label; the full sentence (what to do) is one tap away and always read to screen readers.
  const short = locating ? tr("gpsRequesting") : good ? tr("gpsPillOk") : blocked ? tr("gpsPillBlocked") : tr("gpsPillWeak");
  const acc = live && !blocked && !stale ? ` · ±${Math.round(live.accuracyM)} m` : "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${text} ${hint}` : text}
      accessibilityHint={good ? undefined : tr("gpsEnable")}
      accessibilityState={{ expanded: open }}
      onPress={() => {
        if (!good) setOpen((v) => !v);
        refreshGps();
      }}
      style={(s) => [styles.gps, palette, open ? styles.gpsOpen : styles.gpsPill, s.pressed && { opacity: 0.85 }]}
    >
      <View style={styles.gpsRow}>
        <Icon size={16} color={ink} />
        <Text style={[styles.gpsText, { color: ink }]} numberOfLines={1}>
          {short}
          {acc}
        </Text>
        {!good && !locating ? (
          <View style={[styles.gpsChip, { borderColor: ink }]}>
            <Text style={[styles.gpsChipText, { color: ink }]}>{tr("retry")}</Text>
          </View>
        ) : null}
      </View>
      {open && !good ? (
        <View style={{ gap: 2, paddingLeft: 24 }}>
          <Text style={[styles.gpsHint, { color: ink, fontWeight: "700", opacity: 1 }]}>{text}</Text>
          {hint ? <Text style={[styles.gpsHint, { color: ink }]}>{hint}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/** Same component under the design-system name. */
export const GpsStatus = GpsLine;

export const KIND_ICON: Record<string, LucideIcon> = {
  pickup: Package,
  delivery: Truck,
  return: Undo2,
  address_verification: MapPinned,
  inventory: PackageCheck,
  vendor_visit: Store,
  marketplace_booking: CalendarCheck,
};

export function kindIcon(kind: string): LucideIcon {
  return KIND_ICON[kind] ?? Package;
}

export function stateTone(state: TaskState): Tone {
  return state === "COMPLETED" ? "green" : state === "FAILED_ATTEMPT" ? "red" : state === "CANCELLED" ? "slate" : state === "ASSIGNED" || state === "UNASSIGNED" ? "slate" : "peach";
}

export function SlaBadge({ sla, serverTime, completed }: { sla: Sla | null | undefined; serverTime?: string | null; completed?: boolean }) {
  const { config, home } = useApp();
  const tr = useT();
  useTick(30_000);
  const offset = clockOffsetMs(serverTime ?? home?.serverTime ?? null);
  const view = slaView(sla, offset, config?.rules.slaAtRiskMin ?? 45, Date.now(), completed);
  if (!view.status) return <Badge label={tr("noSla")} tone="slate" />;
  const tone: Tone = view.status === "BREACHED" ? "red" : view.status === "AT_RISK" ? "amber" : "green";
  if (completed) return <Badge label={tr(`sla_${view.status}` as I18nKey)} tone={tone} icon={Timer} />;
  const when =
    view.remainingSec !== null && view.remainingSec < 0
      ? tr("overdueBy", { t: formatCountdown(-view.remainingSec) })
      : tr("dueIn", { t: formatCountdown(view.remainingSec) });
  return <Badge label={`${tr(`sla_${view.status}` as I18nKey)} · ${when}`} tone={tone} icon={Timer} />;
}

export function StateBadge({ state }: { state: TaskState }) {
  const tkr = useTk();
  return <Badge label={tkr(`state_${state}`, state)} tone={stateTone(state)} dot />;
}

export function KindBadge({ kind }: { kind: TaskKind }) {
  const tkr = useTk();
  return <Badge label={tkr(`kind_${kind}`, kind)} tone={kind === "delivery" ? "peach" : kind === "return" ? "blue" : kind === "pickup" ? "violet" : "green"} icon={kindIcon(kind)} />;
}

export function isBreached(task: Task, offset: number, atRiskMin: number) {
  return slaView(task.sla, offset, atRiskMin, Date.now(), task.state === "COMPLETED").status === "BREACHED";
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
  offline: { backgroundColor: colors.ink },
  pending: { backgroundColor: "#9A3412" },
  failed: { backgroundColor: colors.dangerInk },
  barText: { color: colors.white, fontWeight: "600", fontSize: 13, flex: 1 },
  barAction: { color: colors.white, fontWeight: "800", fontSize: 13, textDecorationLine: "underline" },
  gps: { gap: 6, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: "center" },
  gpsPill: { alignSelf: "flex-start", maxWidth: "100%", borderRadius: 999 },
  gpsOpen: { alignSelf: "stretch", borderRadius: 14 },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  gpsChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginLeft: 4 },
  gpsChipText: { fontSize: 13, fontWeight: "800" },
  gpsOk: { backgroundColor: colors.successBg },
  gpsWarn: { backgroundColor: colors.warningBg },
  gpsBad: { backgroundColor: colors.dangerBg },
  gpsText: { fontSize: 14, fontWeight: "700", flexShrink: 1 },
  gpsHint: { fontSize: 12, opacity: 0.85 },
  gpsRetry: { fontSize: 13, fontWeight: "800", textDecorationLine: "underline", marginTop: 4 },
});
