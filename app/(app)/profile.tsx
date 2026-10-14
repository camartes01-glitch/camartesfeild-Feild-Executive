import { useCallback, useRef, useState } from "react";
import { Circle } from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  AlarmClock,
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  BriefcaseMedical,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CloudCheck,
  CloudOff,
  Languages,
  LogOut,
  MapPin,
  RefreshCw,
  Siren,
  Star,
  Timer,
  TreePalm,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { Avatar, Badge, Button, Card, ErrorState, Field, IconButton, ProgressBar, Screen, SectionHeader, SegmentedControl, SettingsRow, PageHeader } from "@/components/ui";
import { ProfileHero, ShiftEmptyArt } from "@/components/brand-art";
import { Chip, ChipWrap } from "@/components/chips";
import { confirmDialog, showDialog } from "@/components/dialog";
import { SosButton } from "@/components/sos-button";
import { useT } from "@/components/status";
import { colors, radii, space, type } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { errorText, LANGS, type I18nKey } from "@/lib/i18n";
import { OPS } from "@/lib/ops-api";
import { useLayout } from "@/lib/responsive";
import type { HoursMonth, LeaveBalance, LeaveRequest } from "@/lib/types";

type LeaveType = "casual" | "sick" | "earned" | "unpaid";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function dur(min: number) {
  const h = Math.floor(min / 60);
  return `${h}h ${Math.round(min % 60)}m`;
}

function time(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";
}

function validDay(value: string) {
  return ISO_DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

function inclusiveDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export default function ProfileScreen() {
  const app = useApp();
  const tr = useT();
  const l = useLayout();
  const [hours, setHours] = useState<HoursMonth | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [leave, setLeave] = useState<{ balances: LeaveBalance[]; requests: LeaveRequest[] } | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>("casual");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);
  // Where the identity card sits, so one hero image can run behind the header and continue inside the card.
  const [cardBox, setCardBox] = useState<{ y: number; h: number } | null>(null);
  const submitting = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [h, lv] = await Promise.all([
      app.get<HoursMonth>(`${OPS}/hr/hours`),
      app.get<{ balances: LeaveBalance[]; requests: LeaveRequest[] }>(`${OPS}/hr/leave`),
      app.refreshNotifications(),
    ]);
    setLoading(false);
    if (h.ok) setHours(h.body);
    setHoursError(h.ok ? null : errorText(app.language, h.code, h.message));
    if (lv.ok) setLeave(lv.body);
    setLeaveError(lv.ok ? null : errorText(app.language, lv.code, lv.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.get, app.refreshNotifications, app.language]);

  // Reload whenever Profile regains focus (e.g. after clock-out, a leave request or an expense) and on reconnect.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, app.online]),
  );

  const emp = app.home?.employee;
  const name = emp?.displayName ?? app.user?.displayName ?? "";
  const unread = app.notifications.filter((n) => !n.read).length;

  // Leave form: explain exactly what is wrong before anything is sent. The server re-checks all of it.
  const leaveProblems: string[] = [];
  if (from && !validDay(from)) leaveProblems.push(tr("leaveFromInvalid"));
  if (to && !validDay(to)) leaveProblems.push(tr("leaveToInvalid"));
  const datesOk = validDay(from) && validDay(to);
  if (datesOk && to < from) leaveProblems.push(tr("err_LEAVE_DATES_INVALID"));
  const days = datesOk && to >= from ? inclusiveDays(from, to) : 0;
  const balance = leave?.balances.find((b) => b.type === leaveType);
  if (days && balance && leaveType !== "unpaid" && days > balance.available) {
    leaveProblems.push(tr("leaveOverBalance", { n: balance.available }));
  }
  const clash = days ? leave?.requests.find((r) => r.status !== "rejected" && r.from <= to && from <= r.to) : undefined;
  if (clash) leaveProblems.push(tr("leaveOverlapLocal", { from: clash.from, to: clash.to }));
  if (from && to && reason.trim().length < 3) leaveProblems.push(tr("err_LEAVE_REASON_REQUIRED"));
  const canApply = datesOk && days > 0 && reason.trim().length >= 3 && leaveProblems.length === 0 && !leaveBusy;

  async function applyLeave() {
    if (submitting.current || !canApply) return;
    submitting.current = true;
    setLeaveBusy(true);
    const outcome = await app.requestLeave({ type: leaveType, from, to, reason: reason.trim() });
    submitting.current = false;
    setLeaveBusy(false);
    if (outcome.state === "REJECTED" || outcome.state === "REFUSED") {
      return showDialog(tr("applyLeave"), errorText(app.language, outcome.code, outcome.message));
    }
    showDialog(tr("applyLeave"), outcome.state === "SYNCED" ? tr("leaveSubmitted", { id: outcome.serverId ?? "" }) : tr("queuedOffline"));
    setFrom("");
    setTo("");
    setReason("");
    void load();
  }

  function confirmLeave() {
    if (!canApply) return;
    confirmDialog({
      title: tr("applyLeave"),
      message: tr("leaveConfirm", { type: tr(`leave_${leaveType}` as I18nKey), from, to, n: days }),
      confirm: tr("applyLeave"),
      cancel: tr("cancel"),
      onConfirm: () => void applyLeave(),
    });
  }

  function signOut() {
    const unsynced = app.queueSummary.unsynced;
    confirmDialog({
      title: tr("signOut"),
      message: unsynced ? tr("signOutUnsynced", { n: unsynced }) : tr("signOutConfirm"),
      confirm: tr("signOut"),
      cancel: tr("cancel"),
      destructive: true,
      onConfirm: () => app.logout(),
    });
  }

  const unsyncedItems = app.queue.filter((q) => q.status !== "SYNCED");
  const failedCount = unsyncedItems.filter((q) => q.status === "FAILED").length;

  const heroH = cardBox ? cardBox.y + cardBox.h + space.xl : 0;

  /* ── Identity ── */
  const identity = (
    <View onLayout={(e) => setCardBox({ y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}>
    <Card elevated padding={space.xl}>
      {l.twoCol && cardBox ? <ProfileHero height={heroH} style={{ position: "absolute", right: -1, top: -(cardBox.y + space.xl) - 1 }} /> : null}
      <View style={styles.identity}>
        <Avatar name={name} size={l.twoCol ? 84 : 64} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Text style={[type.title, l.twoCol && { fontSize: 26 }]} numberOfLines={2}>
            {name}
          </Text>
          <Text style={[type.meta, { fontSize: 14, fontVariant: ["tabular-nums"] }]}>{tr("employeeId", { id: emp?.employeeId ?? app.user?.employeeId ?? "" })}</Text>
          <View style={styles.wrapRow}>
            <Badge icon={BriefcaseBusiness} label={`${tr("roleLabel")}: ${tr(`role_${app.user?.role ?? "field_executive"}` as I18nKey)}`} tone="peach" />
            <Badge icon={MapPin} label={`${tr("cityLabel")}: ${emp?.city ?? app.user?.city ?? "—"}`} tone="slate" />
          </View>
          {emp?.hub ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Building2 size={14} color={colors.muted} />
              <Text style={type.meta} numberOfLines={1}>
                {tr("hub")}: {emp.hub.name}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.sosRow}>
        <Siren size={16} color={colors.primary} />
        <Text style={[type.meta, { flex: 1 }]}>{tr("sosHint")}</Text>
        <SosButton compact />
      </View>
    </Card>
    </View>
  );

  /* ── Alerts ── */
  const alerts = (
    <Card>
      <SectionHeader title={tr("notifications")} icon={Bell} action={<Badge label={tr("unreadCount", { n: unread })} tone={unread ? "peach" : "slate"} dot={!!unread} />} />
      <Text style={type.meta} numberOfLines={2}>
        {app.notifications[0] ? `${tr("latestAlert")}: ${app.notifications[0].title}` : tr("noAlerts")}
      </Text>
      <RowButton icon={Bell} label={tr("openAlerts")} onPress={() => router.push("/alerts")} />
    </Card>
  );

  /* ── Hours ── */
  const hoursCard = <HoursCard hours={hours} error={hoursError} loading={loading} onRefresh={() => void load()} />;
  const onOvertime = (id: string) => {
    const r = app.requestOvertime(id, "");
    showDialog(tr("requestOvertime"), r.ok ? (r.queued ? tr("queuedOffline") : tr("sentToServer")) : errorText(app.language, r.code, r.message));
  };
  const planCard = <WorkdayPlanCard hours={hours} />;
  const shiftsCard = <ShiftHistoryCard hours={hours} onOvertime={onOvertime} />;

  /* ── Leave ── */
  const leaveCard = (
    <Card>
      <SectionHeader title={tr("leaveBalance")} icon={CalendarDays} />
      {leaveError ? <ErrorState message={leaveError} onRetry={() => void load()} retryLabel={tr("retry")} /> : null}
      <View style={{ gap: space.md }}>
        {(leave?.balances ?? []).map((b) => {
          const look = LEAVE_LOOK[b.type] ?? LEAVE_LOOK.unpaid;
          return (
            <View key={b.type} style={styles.leaveRow}>
              <View style={[styles.leaveIcon, { backgroundColor: look.bg }]}>
                <look.icon size={18} color={look.fg} />
              </View>
              <Text style={[type.label, { width: 64 }]}>{tr(`leave_${b.type}` as I18nKey)}</Text>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.balance, { alignSelf: "flex-end" }]}>
                  {b.available}
                  <Text style={type.caption}> / {b.entitled}</Text>
                </Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { backgroundColor: look.bar, width: `${Math.round((b.entitled ? Math.min(1, b.available / b.entitled) : 0) * 100)}%` }]} />
                </View>
                {b.pending ? <Text style={type.caption}>{tr("leavePendingDays", { n: b.pending })}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>

      <Text style={[type.heading, { marginTop: space.md }]}>{tr("applyLeave")}</Text>
      <ChipWrap>
        {(["casual", "sick", "earned", "unpaid"] as const).map((lt) => (
          <Chip key={lt} tone="brand" icon={Circle} label={tr(`leave_${lt}` as I18nKey)} selected={leaveType === lt} onPress={() => setLeaveType(lt)} />
        ))}
      </ChipWrap>
      <View style={[styles.dates, l.width < 560 && { flexDirection: "column" }]}>
        <View style={{ flex: 1 }}>
          <Field label={tr("from")} value={from} onChangeText={(v) => setFrom(v.trim())} placeholder={istToday()} maxLength={10} error={from && !validDay(from) ? tr("leaveFromInvalid") : null} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={tr("to")} value={to} onChangeText={(v) => setTo(v.trim())} placeholder={istToday()} maxLength={10} error={to && !validDay(to) ? tr("leaveToInvalid") : null} />
        </View>
      </View>
      <Field label={tr("reason")} required value={reason} onChangeText={setReason} multiline placeholder={tr("leaveReasonHint")} />
      {days ? (
        <View style={styles.estimate}>
          <Text style={type.label}>{tr("leaveDays", { n: days })}</Text>
          {balance && leaveType !== "unpaid" ? <Text style={type.meta}>{tr("leaveRemainingAfter", { n: Math.max(0, balance.available - days) })}</Text> : null}
        </View>
      ) : null}
      {leaveProblems.map((p) => (
        <Text key={p} style={styles.why}>
          • {p}
        </Text>
      ))}
      <Button label={tr("applyLeave")} icon={ArrowRight} loading={leaveBusy} disabled={!canApply} onPress={confirmLeave} />

      {leave && leave.requests.length ? <Text style={[type.heading, { marginTop: space.sm }]}>{tr("myLeave")}</Text> : null}
      {(leave?.requests ?? []).slice(0, 8).map((r) => (
        <View key={r.id} style={styles.listRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: "700" }]}>
              {tr(`leave_${r.type}` as I18nKey)} · {r.from} → {r.to} ({r.days})
            </Text>
            {r.reason ? <Text style={type.meta}>{r.reason}</Text> : null}
          </View>
          <Badge label={tr(`leaveStatus_${r.status}` as I18nKey)} tone={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "amber"} dot />
        </View>
      ))}
    </Card>
  );

  /* ── Settings: expenses, sync, language ── */
  const syncValue = !app.online
    ? tr("offline")
    : unsyncedItems.length
      ? `${tr("syncPending", { n: unsyncedItems.length - failedCount })}${failedCount ? ` · ${tr("syncFailed", { n: failedCount })}` : ""}`
      : tr("syncAllDone");
  const expensesCard = (
    <Card padding={space.md}>
      <SettingsRow icon={Wallet} label={tr("travelExpenses")} value={tr("travelExpensesHint")} tone="peach" onPress={() => router.push("/expenses")} last />
    </Card>
  );
  const syncCard = (
    <Card padding={space.md}>
      <SettingsRow
        icon={!app.online ? CloudOff : failedCount ? TriangleAlert : CloudCheck}
        tone={!app.online ? "slate" : failedCount ? "red" : unsyncedItems.length ? "amber" : "green"}
        label={tr("syncQueue")}
        value={`${syncValue}${app.lastSyncAt ? ` · ${tr("lastSynced", { time: time(new Date(app.lastSyncAt).toISOString()) })}` : ""}`}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel={tr("syncNow")} disabled={!app.online} onPress={app.syncNow} style={(s) => [styles.syncBtn, !app.online && { opacity: 0.5 }, s.pressed && { opacity: 0.8 }]}>
            <Text style={styles.syncBtnText}>{tr("syncNow")}</Text>
          </Pressable>
        }
        last={!unsyncedItems.length}
      />
      {unsyncedItems.map((q) => (
        <View key={q.id} style={styles.queueItem}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: "700", fontSize: 14 }]}>{q.label}</Text>
            <Text style={type.meta}>
              {tr(`queue_${q.status}` as I18nKey)}
              {q.lastError ? ` · ${errorText(app.language, q.lastCode, q.lastError)}` : ""}
            </Text>
          </View>
          {q.status === "FAILED" ? (
            <View style={{ gap: 4 }}>
              <Button compact label={tr("retry")} variant="secondary" onPress={() => app.retryQueued(q.id)} />
              <Button compact label={tr("discard")} variant="ghost" onPress={() => app.discardQueued(q.id)} />
            </View>
          ) : null}
        </View>
      ))}
    </Card>
  );
  const languageCard = (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={styles.langIcon}>
          <Languages size={18} color="#475569" />
        </View>
        <Text style={type.heading}>{tr("language")}</Text>
      </View>
      <SegmentedControl outline options={LANGS.map((x) => ({ id: x.id, label: x.label }))} value={app.language} onChange={(id) => app.setLanguage(id)} />
    </Card>
  );

  const danger = (
    <Card>
      <Text style={[type.label, { color: colors.dangerInk, fontSize: 15 }]}>{tr("dangerZone")}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("signOut")} onPress={signOut} style={(s) => [styles.signOut, s.pressed && { opacity: 0.85 }]}>
        <LogOut size={20} color={colors.dangerInk} />
        <Text style={styles.signOutText}>{tr("signOut")}</Text>
      </Pressable>
    </Card>
  );

  const sideW = l.width >= 1600 ? 480 : l.width >= 1400 ? 440 : 380;

  return (
    <Screen safeTop refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {/* Wide screens: camera-kit artwork across the top right, continuing inside the identity card. */}
      {l.twoCol && cardBox ? <ProfileHero height={heroH} style={{ position: "absolute", top: -space.xl, right: -1 }} /> : null}
      <PageHeader title={tr("profile")} subtitle={tr("profileSubtitle")} />
      {identity}
      {l.twoCol ? (
        <View style={styles.cols}>
          <View style={styles.col}>
            {hoursCard}
            {l.width >= 1200 ? (
              <View style={styles.cols}>
                <View style={styles.col}>
                  {planCard}
                  {shiftsCard}
                </View>
                <View style={styles.col}>{leaveCard}</View>
              </View>
            ) : (
              <>
                {planCard}
                {shiftsCard}
                {leaveCard}
              </>
            )}
          </View>
          <View style={{ width: sideW, gap: space.md }}>
            {alerts}
            {expensesCard}
            {syncCard}
            {languageCard}
            {danger}
          </View>
        </View>
      ) : (
        <>
          {alerts}
          {hoursCard}
          {planCard}
          {shiftsCard}
          {leaveCard}
          {expensesCard}
          {syncCard}
          {languageCard}
          {danger}
        </>
      )}
    </Screen>
  );
}

const LEAVE_LOOK: Record<string, { icon: LucideIcon; fg: string; bg: string; bar: string }> = {
  casual: { icon: TreePalm, fg: colors.successInk, bg: colors.successBg, bar: "#86D9A8" },
  sick: { icon: BriefcaseMedical, fg: colors.infoInk, bg: colors.infoBg, bar: "#5B9BF0" },
  earned: { icon: Star, fg: colors.warningInk, bg: colors.warningBg, bar: "#B79AF5" },
  unpaid: { icon: CalendarDays, fg: colors.muted, bg: "#F1F5F9", bar: colors.faint },
};

/** Full-width outlined row button with a trailing chevron (Open alerts). */
function RowButton({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={(s) => [styles.rowBtn, s.pressed && { opacity: 0.8 }]}>
      <View style={{ width: 20 }} />
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }}>
        <Icon size={18} color={colors.ink} />
        <Text style={[type.label, { fontSize: 15 }]}>{label}</Text>
      </View>
      <ChevronRight size={20} color={colors.primary} />
    </Pressable>
  );
}

function Tile({ icon: Icon, value, label, bg, fg }: { icon: LucideIcon; value: string | number; label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: bg }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.tileIcon}>
        <Icon size={22} color={fg} />
      </View>
      <View style={{ gap: 2 }}>
        <Text style={styles.tileValue}>{value}</Text>
        <Text style={type.meta}>{label}</Text>
      </View>
    </View>
  );
}

function monthInfo(hours: HoursMonth | null) {
  const today = istToday();
  const month = hours?.month ?? today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sunday
  const present = new Set((hours?.days ?? []).filter((d) => d.workedMinutes > 0).map((d) => d.date));
  return { today, month, y, m, daysInMonth, firstDow, present };
}

/** Attendance at a glance: worked / overtime / days present, attendance rate and this week. */
function HoursCard({ hours, error, loading, onRefresh }: { hours: HoursMonth | null; error: string | null; loading: boolean; onRefresh: () => void }) {
  const tr = useT();
  const { today, month, y, m, daysInMonth, present } = monthInfo(hours);
  // Working days elapsed so far this month (Mon–Sat), for an approximate attendance rate. Display only:
  // payroll figures always come from the server.
  const lastDay = today.startsWith(month) ? Number(today.slice(8, 10)) : daysInMonth;
  let workingDays = 0;
  for (let d = 1; d <= lastDay; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 0) workingDays++;
  const attendance = workingDays ? Math.min(1, (hours?.attendanceDays ?? 0) / workingDays) : 0;
  // This week (Sun–Sat) around today.
  const t = new Date(`${today}T00:00:00Z`);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(t);
    d.setUTCDate(t.getUTCDate() - t.getUTCDay() + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <Card>
      <SectionHeader title={`${tr("hours")} · ${tr("thisMonth")}`} icon={AlarmClock} action={<IconButton icon={RefreshCw} label={tr("refresh")} onPress={onRefresh} />} />
      {error ? <ErrorState message={error} onRetry={onRefresh} retryLabel={tr("retry")} /> : null}
      {hours ? (
        <>
          <View style={styles.metrics}>
            <Tile icon={AlarmClock} value={dur(hours.workedMinutes)} label={tr("worked")} bg="#FFF3EC" fg={colors.primary} />
            <Tile icon={Timer} value={dur(hours.overtimeMinutes)} label={tr("overtime")} bg="#F3F0FF" fg={colors.violet} />
            <Tile icon={CalendarCheck} value={hours.attendanceDays} label={tr("attendanceDays")} bg="#ECFAF3" fg={colors.success} />
          </View>
          <View style={{ gap: 6 }}>
            <View style={styles.rowBetween}>
              <Text style={type.label}>{tr("attendanceRate")}</Text>
              <Text style={styles.balance}>{Math.round(attendance * 100)}%</Text>
            </View>
            <ProgressBar value={attendance} tone="green" />
            <Text style={type.meta}>{tr("attendanceRateHint", { n: hours.attendanceDays, d: workingDays })}</Text>
          </View>
          <View style={styles.week} accessibilityLabel={tr("attendanceCalendar")}>
            {week.map((iso, i) => (
              <View key={iso} style={styles.weekDay}>
                <Text style={styles.weekHead}>{["S", "M", "T", "W", "T", "F", "S"][i]}</Text>
                <View style={[styles.weekDot, present.has(iso) && { backgroundColor: colors.success }, iso === today && styles.weekToday]} />
              </View>
            ))}
          </View>
        </>
      ) : !error ? (
        <Text style={type.meta}>{loading ? tr("loading") : ""}</Text>
      ) : null}
    </Card>
  );
}

/** Month calendar: days worked (green) and today (orange ring). */
function WorkdayPlanCard({ hours }: { hours: HoursMonth | null }) {
  const tr = useT();
  const { language } = useApp();
  const { today, month, y, m, daysInMonth, firstDow, present } = monthInfo(hours);
  const loc = language === "hi" ? "hi-IN" : language === "te" ? "te-IN" : "en-IN";
  const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(loc, { month: "long", year: "numeric", timeZone: "UTC" });
  const heads = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(loc, { weekday: "short", timeZone: "UTC" }));
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  return (
    <Card>
      <SectionHeader title={tr("rosterSubtitle")} icon={CalendarDays} />
      <View style={styles.monthBar}>
        <CalendarClock size={16} color={colors.ink} />
        <Text style={[type.heading, { fontSize: 15 }]}>{title}</Text>
      </View>
      <View style={styles.calendar} accessibilityLabel={tr("attendanceCalendar")}>
        {heads.map((d, i) => (
          <Text key={`h${i}`} style={styles.calHead}>
            {d}
          </Text>
        ))}
        {cells.map((d, i) => {
          if (!d) {
            return (
              <View key={`e${i}`} style={styles.calCell}>
                <View style={styles.calBlank} />
              </View>
            );
          }
          const iso = `${month}-${String(d).padStart(2, "0")}`;
          const isPresent = present.has(iso);
          const isToday = iso === today;
          return (
            <View key={iso} style={styles.calCell}>
              <View style={[styles.calDay, isPresent && styles.calPresent, isToday && styles.calToday]}>
                <Text style={[styles.calText, isPresent && { color: colors.white }, isToday && !isPresent && { color: colors.primaryDark }]}>{d}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function ShiftHistoryCard({ hours, onOvertime }: { hours: HoursMonth | null; onOvertime: (shiftId: string) => void }) {
  const tr = useT();
  return (
    <Card>
      <SectionHeader title={tr("shiftHistory")} icon={AlarmClock} />
      {hours && hours.shifts.length === 0 ? (
        <View style={{ alignItems: "center", gap: 4 }}>
          <ShiftEmptyArt width={160} />
          <Text style={[type.label, { fontSize: 15 }]}>{tr("noShifts")}</Text>
          <Text style={[type.caption, { textAlign: "center" }]}>{tr("noShiftsBody")}</Text>
        </View>
      ) : null}
      {(hours?.shifts ?? [])
        .slice(-5)
        .reverse()
        .map((s) => (
          <View key={s.shiftId} style={styles.listRow}>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontWeight: "700" }]}>{new Date(s.clockIn).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" })}</Text>
              <Text style={[type.meta, { fontVariant: ["tabular-nums"] }]}>
                {time(s.clockIn)} – {s.clockOut ? time(s.clockOut) : tr("shiftOpen")} · {dur(s.workedMinutes)}
                {s.overtimeMinutes ? ` · ${tr("overtime")} ${dur(s.overtimeMinutes)}` : ""}
              </Text>
            </View>
            {s.overtimeRequest ? (
              <Badge label={tr("overtimeRequested", { status: s.overtimeRequest.status })} tone="blue" />
            ) : s.overtimeMinutes > 0 && s.clockOut ? (
              <Button compact label={tr("requestOvertime")} variant="ghost" onPress={() => onOvertime(s.shiftId)} />
            ) : (
              <Badge label={s.clockOut ? tr("shiftClosed") : tr("shiftOpen")} tone={s.clockOut ? "slate" : "green"} dot />
            )}
          </View>
        ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", gap: space.lg, alignItems: "center" },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sosRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  cols: { flexDirection: "row", gap: space.lg, alignItems: "flex-start" },
  col: { flex: 1, minWidth: 0, gap: space.md },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  balance: { fontSize: 18, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"] },
  dates: { flexDirection: "row", gap: space.md },
  estimate: { backgroundColor: colors.primarySoft, borderRadius: radii.md, padding: space.md, gap: 2 },
  why: { color: colors.warningInk, fontWeight: "600", fontSize: 13 },
  listRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.line },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tile: { flex: 1, minWidth: 150, flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radii.md, padding: space.lg, minHeight: 96 },
  tileIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.7)", alignItems: "center", justifyContent: "center" },
  tileValue: { fontSize: 22, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"], letterSpacing: -0.4 },
  week: { flexDirection: "row", marginTop: space.xs },
  weekDay: { flex: 1, alignItems: "center", gap: 10 },
  weekHead: { fontSize: 12, fontWeight: "700", color: colors.muted },
  weekDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#CBD5E1" },
  weekToday: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.white },
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4 },
  calendar: { flexDirection: "row", flexWrap: "wrap" },
  calHead: { width: `${100 / 7}%`, textAlign: "center", fontSize: 12, fontWeight: "600", color: colors.muted, paddingVertical: 6 },
  calCell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 3 },
  calBlank: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#E2E8F0", marginVertical: 11 },
  calDay: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  calPresent: { backgroundColor: colors.success },
  calToday: { borderWidth: 2, borderColor: colors.primary },
  calText: { fontSize: 12, fontWeight: "600", color: colors.ink, fontVariant: ["tabular-nums"] },
  leaveRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  leaveIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  track: { height: 6, borderRadius: 3, backgroundColor: "#EEF2F6", overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  rowBtn: { flexDirection: "row", alignItems: "center", minHeight: 52, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radii.md, paddingHorizontal: space.lg, backgroundColor: colors.white },
  syncBtn: { backgroundColor: colors.primarySoft, borderRadius: radii.md, paddingHorizontal: space.lg, minHeight: 48, alignItems: "center", justifyContent: "center" },
  syncBtnText: { fontSize: 15, fontWeight: "800", color: colors.primaryDark },
  queueItem: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, paddingLeft: 48, borderTopWidth: 1, borderTopColor: colors.line },
  langIcon: { width: 36, height: 36, borderRadius: 14, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, minHeight: 52, borderRadius: radii.md, backgroundColor: colors.dangerBg },
  signOutText: { fontSize: 16, fontWeight: "800", color: colors.dangerInk },
});
