import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  Bell,
  CalendarDays,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Clock,
  ListChecks,
  MapPin,
  Store,
  Timer,
  type LucideIcon,
} from "lucide-react-native";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Columns,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  IconCircle,
  MetricTile,
  Screen,
  SectionHeader,
} from "@/components/ui";
import { CheckRow } from "@/components/chips";
import { confirmDialog, showDialog } from "@/components/dialog";
import { NavigateButton } from "@/components/navigate-button";
import { GeoCamera } from "@/components/geo-camera";
import { RouteTimeline } from "@/components/route";
import { SosButton } from "@/components/sos-button";
import { GpsLine, KindBadge, StateBadge, kindIcon, useT, useTick } from "@/components/status";
import { colors, elevation, radii, space, type } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { useLayout } from "@/lib/responsive";
import { HeroPhoto, NextMap, RouteMap, RouteScene } from "@/components/brand-art";
import { clockOffsetMs, formatCountdown, slaView } from "@/lib/field-ops";
import { formatKm, haversineKm, isStaleFix } from "@/lib/geo";
import { openTask } from "@/lib/nav";
import { errorText, type I18nKey } from "@/lib/i18n";
import type { CapturedImage } from "@/lib/media-store";
import type { Task } from "@/lib/types";

function hhmm(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

/** Greeting by the hour in India (IST), whatever the device clock zone. */
function greetingKey(): I18nKey {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "goodMorning" : h < 17 ? "goodAfternoon" : "goodEvening";
}

function duration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function HomeScreen() {
  const { home, homeLoading, homeError, refreshHome, live, clockIn, clockOut, language, online, queue, config } = useApp();
  const tr = useT();
  const l = useLayout();
  useTick(30_000);
  const [helmet, setHelmet] = useState(false);
  const [bike, setBike] = useState(false);
  const [selfie, setSelfie] = useState<CapturedImage | null>(null);
  const [override, setOverride] = useState("");
  const [needsOverride, setNeedsOverride] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!home) {
    return (
      <Screen safeTop refreshControl={<RefreshControl refreshing={homeLoading} onRefresh={refreshHome} />}>
        <GpsLine />
        {homeError ? (
          <ErrorState message={homeError} onRetry={() => void refreshHome()} retryLabel={tr("retry")} />
        ) : (
          <EmptyState icon={Clock} title={tr("loading")} />
        )}
      </Screen>
    );
  }

  const shift = home.shift;
  const gate = home.clockInGate;
  const firstStopKm = gate.firstStop && live ? haversineKm(live, gate.firstStop) : null;

  async function submitClockIn() {
    if (!selfie || busy) return;
    setBusy(true);
    const res = await clockIn({ selfie, overrideReason: needsOverride ? override : undefined });
    setBusy(false);
    if (res.ok) {
      const body = res.body as { clockInVia?: string; clockIn?: string };
      setSelfie(null);
      setOverride("");
      setNeedsOverride(false);
      showDialog(
        tr("onShift"),
        [tr("clockedInAt", { time: hhmm(body.clockIn) }), body.clockInVia ? tr(`clockedInVia_${body.clockInVia}` as I18nKey) : ""]
          .filter(Boolean)
          .join("\n"),
      );
      return;
    }
    if (res.code === "OUTSIDE_RADIUS_AND_WINDOW" || res.code === "OVERRIDE_REASON_TOO_SHORT") setNeedsOverride(true);
    showDialog(tr("clockIn"), errorText(language, res.code, res.message));
  }

  function confirmClockOut() {
    confirmDialog({
      title: tr("clockOut"),
      message: tr("clockOutConfirm"),
      confirm: tr("clockOut"),
      cancel: tr("cancel"),
      destructive: true,
      onConfirm: () => {
        const r = clockOut();
        if (!r.ok) showDialog(tr("clockOut"), errorText(language, r.code, r.message));
        else showDialog(tr("clockOut"), r.queued ? tr("queuedOffline") : tr("clockOutQueued"));
      },
    });
  }

  const next = home.nextTask;
  const clockOutPending = queue.some((q) => q.path.endsWith("/shifts/clock-out") && q.status !== "SYNCED");
  // Say exactly why Clock in is not available yet.
  const clockInMissing: string[] = [];
  if (!helmet || !bike) clockInMissing.push(tr("needSafety"));
  if (!selfie) clockInMissing.push(tr("needSelfie"));
  if (!live || isStaleFix(live)) clockInMissing.push(tr("needGps"));
  else if (live.accuracyM > (config?.rules.maxGpsAccuracyM ?? 100)) clockInMissing.push(tr("needGpsAccuracy", { m: config?.rules.maxGpsAccuracyM ?? 100 }));
  if (needsOverride && override.trim().length < 10) clockInMissing.push(tr("needOverride"));
  if (!online) clockInMissing.push(tr("err_OFFLINE"));

  const firstName = home.employee.displayName.split(" ")[0];
  const narrow = l.width < 430;
  const greeting = (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.greet}>{tr(greetingKey())}</Text>
      <Text style={styles.hello} numberOfLines={2}>
        {firstName}
      </Text>
    </View>
  );
  const unread = home.unreadNotifications;

  const shiftCard = shift ? (
    <Card tone="success">
      <View style={styles.rowBetween}>
        <Badge label={tr("onShift")} tone="green" dot />
        <Text style={[type.metric, { fontSize: 28 }]}>{duration((Date.now() - Date.parse(shift.clockIn)) / 60000)}</Text>
      </View>
      <Text style={type.meta}>
        {tr("clockedInAt", { time: hhmm(shift.clockIn) })}
        {shift.clockInVia ? ` · ${tr(`clockedInVia_${shift.clockInVia}` as I18nKey)}` : ""}
      </Text>
      {clockOutPending ? (
        <Badge label={tr("clockOutPending")} tone="blue" dot />
      ) : (
        <Button label={tr("clockOut")} variant="secondary" icon={Clock} onPress={confirmClockOut} />
      )}
    </Card>
  ) : (
    <Card accent>
      <SectionHeader title={tr("clockInTitle")} icon={Clock} />
      {gate.firstStop ? (
        <Text style={type.meta}>{tr("firstStop", { name: gate.firstStop.name, km: firstStopKm !== null ? formatKm(firstStopKm) : "—" })}</Text>
      ) : null}
      <Badge
        label={gate.rosterWindow ? (gate.rosterWindow.open ? tr("rosterWindowOpen") : tr("rosterWindowClosed", { time: hhmm(gate.rosterWindow.opensAt) })) : tr("noRosterToday")}
        tone={gate.rosterWindow?.open ? "green" : "amber"}
        dot
      />
      <Text style={[type.label, { marginTop: 4 }]}>{tr("safetyTitle")}</Text>
      <CheckRow label={tr("safetyHelmet")} checked={helmet} onToggle={() => setHelmet((v) => !v)} />
      <CheckRow label={tr("safetyTwoWheeler")} checked={bike} onToggle={() => setBike((v) => !v)} />
      <GeoCamera selfie label={selfie ? tr("retakeSelfie") : tr("takeSelfie")} onCaptured={setSelfie} />
      {needsOverride ? (
        <>
          <Text style={type.meta}>{tr("overrideHint")}</Text>
          <Field label={tr("overrideReason")} value={override} onChangeText={setOverride} multiline />
        </>
      ) : null}
      <Button label={tr("clockIn")} icon={CircleCheck} loading={busy} disabled={busy || clockInMissing.length > 0} onPress={() => void submitClockIn()} />
      {clockInMissing.length ? <Text style={styles.why}>{tr("stillNeeded", { list: clockInMissing.join(" · ") })}</Text> : null}
    </Card>
  );

  // Today's counts from the home API (never computed or invented on the device).
  const metrics = (
    <Card padding={space.md}>
      <SectionHeader title={tr("todaySummary")} />
      {/* Four across in the side panel; 2×2 on phones so each count stays large and tappable-sized. */}
      <View style={[styles.summaryRow, !l.twoCol && styles.summaryGrid]}>
        <SummaryTile icon={CircleCheck} label={tr("completed")} value={home.counts.completed} fg={colors.successInk} bg={colors.successBg} />
        <SummaryTile icon={ListChecks} label={tr("pending")} value={home.counts.pending} fg={colors.primaryDark} bg={colors.primarySoft} />
        <SummaryTile icon={CircleX} label={tr("failed")} value={home.counts.failed} fg={colors.muted} bg="#F1F5F9" />
        <SummaryTile icon={Timer} label={tr("breached")} value={home.counts.slaBreached} fg={colors.dangerInk} bg={colors.dangerBg} alert={home.counts.slaBreached > 0} />
      </View>
    </Card>
  );

  const nextCard = next ? (
    <NextStopCard task={next} serverTime={home.serverTime} />
  ) : (
    <Card elevated>
      <EmptyState icon={ClipboardCheck} title={tr("noNextStop")} body={tr("noNextStopBody")} />
    </Card>
  );

  const route = (
    <Card>
      <SectionHeader
        title={tr("todayRoute")}
        icon={MapPin}
        action={home.today.published ? <Text style={styles.window}>{tr("shiftWindow", { s: home.today.shiftStart ?? "", e: home.today.shiftEnd ?? "" })}</Text> : null}
      />
      {home.today.published && home.today.stops.length ? (
        <RouteTimeline stops={home.today.stops} currentTaskId={next?.id} onOpen={openTask} limit={8} />
      ) : (
        <View style={styles.routeEmpty}>
          <RouteMap size={150} />
          <View style={{ flex: 1, minWidth: 180, gap: 4 }}>
            <Text style={[type.body, { fontWeight: "700" }]}>{home.today.published ? tr("rosterNoStops") : tr("noRoster")}</Text>
            {home.today.published ? null : <Text style={type.meta}>{tr("routeEmptyBody")}</Text>}
          </View>
        </View>
      )}
      {l.twoCol && !(home.today.published && home.today.stops.length) ? (
        <View style={styles.routeScene}>
          <RouteScene width={620} />
        </View>
      ) : null}
    </Card>
  );

  const tomorrow = (
    <Card tone="muted" padding={space.md}>
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <IconCircle icon={CalendarDays} tone="slate" size={32} />
          <Text style={type.heading}>{tr("tomorrowRoster")}</Text>
        </View>
        {home.tomorrow.published ? (
          <Badge label={tr("stopsCount", { n: home.tomorrow.stops.length })} tone="peach" />
        ) : (
          <Badge label={tr("noRoster")} tone="slate" />
        )}
      </View>
      {home.tomorrow.published ? (
        <Text style={type.meta}>
          {tr("shiftWindow", { s: home.tomorrow.shiftStart ?? "", e: home.tomorrow.shiftEnd ?? "" })}
          {home.tomorrow.stops[0] ? ` · ${tr("firstStopShort", { name: home.tomorrow.stops[0].name })}` : ""}
        </Text>
      ) : null}
    </Card>
  );

  const quick = (
    <View style={styles.quick}>
      <QuickAction icon={ListChecks} label={tr("jobs")} onPress={() => router.navigate("/(app)/tasks")} />
      <QuickAction icon={Store} label={tr("newVisit")} onPress={() => router.navigate("/(app)/onboard/new")} />
      <QuickAction icon={Bell} label={unread ? `${tr("notifications")} (${unread})` : tr("notifications")} onPress={() => router.push("/alerts")} badge={unread} />
    </View>
  );

  return (
    <Screen safeTop refreshControl={<RefreshControl refreshing={homeLoading} onRefresh={refreshHome} />}>
      <View style={[styles.hero, elevation[1], l.twoCol && { minHeight: 236 }]}>
        {l.twoCol ? <HeroPhoto height={236} style={styles.heroScene} /> : null}
        {/* Soft brand glow: two tinted shapes, no gradient library or image. */}
        <View style={styles.glowA} pointerEvents="none" />
        <View style={styles.glowB} pointerEvents="none" />
        <View style={styles.heroTop}>
          <Avatar name={home.employee.displayName} size={52} />
          {/* Small phones: the greeting gets its own full-width line under the avatar and actions. */}
          {narrow ? <View style={{ flex: 1 }} /> : greeting}
          <View style={l.twoCol ? styles.heroActionsWide : styles.heroActionsRow}>
          <View>
            <IconButton icon={Bell} label={unread ? `${tr("notifications")} (${unread})` : tr("notifications")} onPress={() => router.push("/alerts")} />
            {unread ? <View style={styles.bellDot} pointerEvents="none" /> : null}
          </View>
          <SosButton compact />
          </View>
        </View>
        {narrow ? greeting : null}
        <Text style={[styles.heroSub, l.twoCol && { maxWidth: "58%" }]}>{tr("homeSubheading")}</Text>
        <View style={[styles.heroChips, l.twoCol && { maxWidth: "60%" }]}>
          <Badge
            label={shift ? tr("onShiftSince", { time: hhmm(shift.clockIn) }) : tr("notOnShift")}
            tone={shift ? "green" : "amber"}
            dot
          />
          <Badge
            label={home.counts.slaBreached ? tr("statusAttention", { n: home.counts.slaBreached }) : next ? tr("statusOnTrack") : tr("statusAllDone")}
            tone={home.counts.slaBreached ? "red" : "green"}
            icon={home.counts.slaBreached ? Timer : CircleCheck}
          />
          {home.employee.hub ? <Badge label={home.employee.hub.name} tone="slate" icon={MapPin} /> : null}
        </View>
        <View style={l.twoCol ? { maxWidth: "60%" } : undefined}>
          <GpsLine />
        </View>
      </View>
      {homeError ? <ErrorState message={homeError} onRetry={() => void refreshHome()} retryLabel={tr("retry")} /> : null}

      {l.twoCol ? (
        <Columns
          sideWidth={l.width >= 1440 ? 455 : 380}
          main={
            <>
              {nextCard}
              {route}
            </>
          }
          side={
            <>
              {shiftCard}
              {metrics}
              {tomorrow}
              <SectionHeader title={tr("quickActions")} />
              {quick}
            </>
          }
        />
      ) : (
        // Phones: purpose-built order (what to do now first), not the desktop columns stacked.
        <>
          {nextCard}
          {shiftCard}
          {metrics}
          {route}
          {tomorrow}
          <SectionHeader title={tr("quickActions")} />
          {quick}
        </>
      )}
    </Screen>
  );
}

/** The one thing that matters most right now: elevated hero with a big SLA countdown and one dominant action. */
function NextStopCard({ task, serverTime }: { task: Task; serverTime: string }) {
  const { live, config } = useApp();
  const tr = useT();
  const l = useLayout();
  const km = live && task.stop ? haversineKm(live, task.stop) : null;
  const view = slaView(task.sla, clockOffsetMs(serverTime), config?.rules.slaAtRiskMin ?? 45, Date.now(), false);
  const overdue = view.remainingSec !== null && view.remainingSec < 0;
  const slaColor = view.status === "BREACHED" ? colors.dangerInk : view.status === "AT_RISK" ? colors.warningInk : colors.successInk;
  const slaBg = view.status === "BREACHED" ? colors.dangerBg : view.status === "AT_RISK" ? colors.warningBg : colors.successBg;
  return (
    <Card elevated padding={space.xl}>
      <View style={styles.rowBetween}>
        <Text style={styles.kicker}>{tr("nextStop")}</Text>
        <View style={styles.badges}>
          <KindBadge kind={task.kind} />
          <StateBadge state={task.state} />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start", marginTop: 4 }}>
        <IconCircle icon={kindIcon(task.kind)} tone="peach" size={48} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={styles.stopTitle} numberOfLines={3}>
            {task.stop?.name ?? task.title}
          </Text>
          {task.stop?.name ? (
            <Text style={styles.taskTitle} numberOfLines={2}>
              {task.title}
            </Text>
          ) : null}
          <Text style={type.meta} numberOfLines={2}>
            {task.taskCode} · {task.stop?.address ?? task.area ?? ""}
          </Text>
        </View>
        {l.width >= 1100 ? <NextMap width={156} /> : null}
      </View>
      <View style={styles.heroStats}>
        {view.status ? (
          <View style={[styles.sla, { backgroundColor: slaBg }]} accessible accessibilityLabel={tr(`sla_${view.status}` as I18nKey)}>
            <Timer size={18} color={slaColor} />
            <View>
              <Text style={[styles.slaValue, { color: slaColor }]}>{view.remainingSec !== null ? formatCountdown(Math.abs(view.remainingSec)) : "—"}</Text>
              <Text style={[type.caption, { color: slaColor }]}>
                {tr(`sla_${view.status}` as I18nKey)} · {overdue ? tr("overdueLabel") : tr("dueLabel")}
              </Text>
            </View>
          </View>
        ) : null}
        {km !== null ? (
          <View style={styles.distance}>
            <MapPin size={18} color={colors.ink} />
            <View>
              <Text style={styles.slaValue}>{formatKm(km)}</Text>
              <Text style={type.caption}>{tr("awayLabel")}</Text>
            </View>
          </View>
        ) : null}
      </View>
      <View style={styles.heroActions}>
        <Button flex={l.width < 375 ? 1 : 2} label={tr("openJob")} onPress={() => openTask(task.id)} />
        <NavigateButton flex={1} dest={task.stop ? { ...task.stop, address: task.stop.address ?? task.area } : { address: task.area }} />
      </View>
    </Card>
  );
}

function SummaryTile({ icon: Icon, label, value, fg, bg, alert }: { icon: LucideIcon; label: string; value: number; fg: string; bg: string; alert?: boolean }) {
  const l = useLayout();
  return (
    <View style={[styles.tile, !l.twoCol && { flexBasis: "45%", minHeight: 80 }, alert && { borderColor: colors.peachBorder, backgroundColor: "#FFF6F4" }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.tileIcon, { backgroundColor: bg }]}>
        <Icon size={15} color={fg} />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={[styles.tileLabel, alert && { color: colors.dangerInk }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function QuickAction({ icon: Icon, label, onPress, badge }: { icon: LucideIcon; label: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={(s) => [
        styles.qa,
        elevation[1],
        (s as { hovered?: boolean }).hovered && [styles.qaHover, elevation[2]],
        s.pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      <View style={styles.qaIcon}>
        <Icon size={22} color={colors.primaryDark} />
        {badge ? <View style={styles.qaBadge} /> : null}
      </View>
      <Text style={styles.qaLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heroScene: { position: "absolute", right: 0, bottom: 0, top: 0 },
  heroActionsRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroActionsWide: { position: "absolute", right: 0, top: 0, flexDirection: "row", alignItems: "center", gap: space.md, zIndex: 2 },
  routeScene: { height: 213, overflow: "hidden", alignItems: "flex-end", marginHorizontal: -space.lgx, marginBottom: -space.lgx, marginTop: -space.xl, borderBottomLeftRadius: radii.lg, borderBottomRightRadius: radii.lg },
  hero: { backgroundColor: colors.white, borderRadius: radii.hero, borderWidth: 1, borderColor: colors.line, padding: space.lgx, gap: space.md, overflow: "hidden" },
  glowA: { position: "absolute", width: 260, height: 260, borderRadius: 130, top: -150, right: -90, backgroundColor: colors.primary, opacity: 0.09 },
  glowB: { position: "absolute", width: 150, height: 150, borderRadius: 75, top: -70, right: 70, backgroundColor: "#FFB48A", opacity: 0.16 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroSub: { fontSize: 16, lineHeight: 22, color: colors.muted, marginTop: -4 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  summaryGrid: { rowGap: space.sm },
  tile: { flexGrow: 1, flexBasis: 64, minWidth: 64, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 10, gap: 4, backgroundColor: colors.white },
  tileIcon: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tileValue: { fontSize: 22, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"] },
  tileLabel: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  routeEmpty: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.lg },
  mapArt: { width: 150, height: 112 },
  mapBlock: { position: "absolute", borderRadius: 10, backgroundColor: "#FBEADB", transform: [{ rotate: "-12deg" }] },
  mapDash: { position: "absolute", width: 8, height: 3, borderRadius: 2, backgroundColor: colors.primary, opacity: 0.7, transform: [{ rotate: "-42deg" }] },
  mapPin: { position: "absolute", left: 92, top: 22, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  heroChips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  greet: { fontSize: 16, fontWeight: "700", color: colors.primaryDark },
  hello: { fontSize: 32, fontWeight: "800", color: colors.ink, letterSpacing: -0.8, lineHeight: 38 },
  bellDot: { position: "absolute", top: 8, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.white },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" },
  why: { fontSize: 13, color: colors.warningInk, fontWeight: "600" },
  window: { fontSize: 13, fontWeight: "700", color: colors.muted, fontVariant: ["tabular-nums"] },
  kicker: { fontSize: 13, fontWeight: "800", color: colors.primaryDark, letterSpacing: 0.2 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stopTitle: { fontSize: 26, fontWeight: "800", color: colors.ink, letterSpacing: -0.6, lineHeight: 31 },
  taskTitle: { fontSize: 14, fontWeight: "600", color: colors.primaryDark },
  heroStats: { flexDirection: "row", gap: space.sm, flexWrap: "wrap", marginTop: space.sm },
  sla: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radii.md, paddingHorizontal: space.md, paddingVertical: 10, flexGrow: 1 },
  distance: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radii.md, paddingHorizontal: space.md, paddingVertical: 10, backgroundColor: "#F6F1EB" },
  slaValue: { fontSize: 20, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"], letterSpacing: -0.4 },
  heroActions: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  quick: { flexDirection: "row", gap: space.sm },
  qa: { flex: 1, minHeight: 92, backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, padding: space.md, gap: space.sm, justifyContent: "space-between" },
  qaHover: { borderColor: colors.peachBorder, transform: [{ translateY: -2 }] },
  qaIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  qaBadge: { position: "absolute", top: 6, right: 6, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.primarySoft },
  qaLabel: { fontSize: 14, fontWeight: "700", color: colors.ink },
});
