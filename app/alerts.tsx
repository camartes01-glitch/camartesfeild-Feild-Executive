import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import {
  Bell,
  BellRing,
  CalendarClock,
  CheckCheck,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Info,
  RefreshCw,
  Siren,
  Timer,
  type LucideIcon,
} from "lucide-react-native";
import { showDialog } from "@/components/dialog";
import { FieldGate } from "@/components/field-gate";
import { useT } from "@/components/status";
import { Button, Card, EmptyState, ErrorState, IconButton, Screen, type Tone } from "@/components/ui";
import { colors, radii, space, type } from "@/constants/theme";
import { headerOptions } from "@/constants/nav";
import { useApp } from "@/lib/app-context";
import { openTaskFromRootScreen } from "@/lib/nav";
import type { AppNotification } from "@/lib/types";

export default function AlertsScreen() {
  return (
    <FieldGate>
      <Alerts />
    </FieldGate>
  );
}

const KIND: Record<string, { icon: LucideIcon; tone: Tone }> = {
  SLA_WARNING: { icon: Timer, tone: "amber" },
  SLA_BREACHED: { icon: Timer, tone: "red" },
  SOS: { icon: Siren, tone: "red" },
  TASK_ASSIGNED: { icon: ClipboardCheck, tone: "peach" },
  TASK_CHANGED: { icon: ClipboardCheck, tone: "peach" },
  TASK_COMPLETED: { icon: CircleCheck, tone: "green" },
  TASK_FAILED: { icon: CircleX, tone: "red" },
  ONBOARD_FOLLOW_UP: { icon: CalendarClock, tone: "blue" },
  ROSTER_UPDATED: { icon: CalendarClock, tone: "blue" },
  LEAVE_REVIEWED: { icon: CheckCheck, tone: "green" },
};

const TONE_BG: Record<string, string> = { amber: colors.warningBg, red: colors.dangerBg, peach: colors.primarySoft, green: colors.successBg, blue: colors.infoBg, slate: "#F1F5F9" };
const TONE_FG: Record<string, string> = { amber: colors.warningInk, red: colors.dangerInk, peach: colors.primaryDark, green: colors.successInk, blue: colors.infoInk, slate: "#475569" };

function dayKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

/** Server messages may embed raw ISO timestamps; show them as an IST date and time instead. */
function readableBody(body: string) {
  return body.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g, (iso) => {
    // Some engines reject more than millisecond precision, so trim microseconds first.
    const d = new Date(iso.replace(/(\.\d{3})\d+/, "$1"));
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  });
}

/** Notification centre. "Read" is only shown once the server has stored it. */
function Alerts() {
  const { notifications, refreshNotifications, markNotificationsRead, markNotificationRead } = useApp();
  const tr = useT();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(!(await refreshNotifications()));
    setLoading(false);
    setLoaded(true);
  }, [refreshNotifications]);

  useEffect(() => {
    void load();
  }, [load]);

  const unread = notifications.filter((n) => !n.read).length;

  async function toggle(id: string, read: boolean) {
    setOpen((cur) => (cur === id ? null : id));
    if (!read && !(await markNotificationRead(id))) showDialog(tr("notifications"), tr("alertReadFailed"));
  }

  async function markAll() {
    setBusy(true);
    const ok = await markNotificationsRead();
    setBusy(false);
    if (!ok) showDialog(tr("notifications"), tr("alertReadFailed"));
  }

  // Group by IST day: Today, Yesterday, then dates.
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const groups: { label: string; items: AppNotification[] }[] = [];
  for (const n of notifications) {
    const k = dayKey(n.at);
    const label = k === today ? tr("today") : k === yesterday ? tr("yesterday") : new Date(n.at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: true, title: tr("notifications"), headerBackTitle: tr("profile"), ...headerOptions }} />
      <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} bottomInset={space.xxl} maxWidth={800}>
        <Card padding={space.md}>
          <View style={styles.summary}>
            <View style={[styles.bell, unread ? { backgroundColor: colors.primarySoft } : null]}>
              {unread ? <BellRing size={20} color={colors.primaryDark} /> : <Bell size={20} color={colors.muted} />}
            </View>
            <Text style={[type.heading, { flex: 1 }]}>{tr("unreadCount", { n: unread })}</Text>
            <IconButton icon={RefreshCw} label={tr("refresh")} onPress={() => void load()} size={40} />
          </View>
          {unread ? <Button label={tr("markAllRead")} variant="secondary" icon={CheckCheck} loading={busy} disabled={busy} onPress={() => void markAll()} /> : null}
        </Card>
        {failed ? <ErrorState message={tr("loadFailed")} onRetry={() => void load()} retryLabel={tr("retry")} /> : null}
        {!loaded && loading ? <EmptyState icon={RefreshCw} title={tr("loading")} /> : null}
        {loaded && !failed && notifications.length === 0 ? <EmptyState icon={Bell} title={tr("noAlerts")} body={tr("noAlertsBody")} /> : null}
        {groups.map((g) => (
          <View key={g.label} style={{ gap: space.sm }}>
            <Text style={styles.group}>{g.label}</Text>
            {g.items.map((n) => {
              const k = KIND[n.kind] ?? { icon: Info, tone: "slate" as Tone };
              const Icon = k.icon;
              const taskId = typeof n.data?.taskId === "string" ? n.data.taskId : null;
              const expanded = open === n.id;
              return (
                <View key={n.id} style={[styles.alert, !n.read && styles.unread]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${n.read ? "" : tr("unread") + ": "}${n.title}`}
                    onPress={() => void toggle(n.id, n.read)}
                    style={(s) => [styles.alertMain, s.pressed && { opacity: 0.85 }]}
                  >
                    <View style={[styles.kindIcon, { backgroundColor: TONE_BG[k.tone] }]}>
                      <Icon size={18} color={TONE_FG[k.tone]} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.title, !n.read && { fontWeight: "800" }]} numberOfLines={expanded ? undefined : 1}>
                          {n.title}
                        </Text>
                        {!n.read ? <View style={styles.dot} /> : null}
                      </View>
                      <Text style={styles.body} numberOfLines={expanded ? undefined : 2}>
                        {readableBody(n.body)}
                      </Text>
                      <Text style={type.caption}>{new Date(n.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}</Text>
                    </View>
                  </Pressable>
                  {expanded && taskId ? <Button compact label={tr("openJob")} variant="secondary" onPress={() => openTaskFromRootScreen(taskId)} /> : null}
                </View>
              );
            })}
          </View>
        ))}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: space.md },
  bell: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  group: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: space.sm },
  alert: { backgroundColor: colors.white, borderRadius: radii.md, padding: space.md, gap: space.sm, borderWidth: 1, borderColor: colors.line },
  unread: { borderColor: colors.peachBorder, borderLeftWidth: 4, borderLeftColor: colors.primary },
  alertMain: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  kindIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  body: { fontSize: 14, color: colors.muted, lineHeight: 20 },
});
