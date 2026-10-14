import { useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { CalendarDays, Clock, MapPin, RefreshCw, Route, Sunrise } from "lucide-react-native";
import { Badge, Card, EmptyState, ErrorState, IconButton, Screen, SectionHeader, SegmentedControl, PageHeader } from "@/components/ui";
import { RouteTimeline } from "@/components/route";
import { useT } from "@/components/status";
import { colors, elevation, radii, space, type } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { openTask } from "@/lib/nav";
import { useLayout } from "@/lib/responsive";
import { RosterBanner, RosterDateDeco, RosterEmpty } from "@/components/brand-art";

function dateParts(iso: string | undefined, language: string) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00+05:30`);
  const loc = language === "hi" ? "hi-IN" : language === "te" ? "te-IN" : "en-IN";
  return {
    day: d.toLocaleDateString(loc, { day: "numeric", timeZone: "Asia/Kolkata" }),
    month: d.toLocaleDateString(loc, { month: "short", timeZone: "Asia/Kolkata" }),
    weekday: d.toLocaleDateString(loc, { weekday: "long", timeZone: "Asia/Kolkata" }),
  };
}

/** Journey plan published by the city manager: date, shift window, hub and an ordered route timeline. */
export default function RosterScreen() {
  const { home, homeLoading, homeError, refreshHome, language } = useApp();
  const tr = useT();
  const l = useLayout();
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const roster = day === "today" ? home?.today : home?.tomorrow;
  const parts = dateParts(roster?.date, language);
  const done = roster?.stops.filter((s) => s.task?.state === "COMPLETED").length ?? 0;

  return (
    <Screen safeTop refreshControl={<RefreshControl refreshing={homeLoading} onRefresh={refreshHome} />}>
      {/* Wide screens: studio banner behind the header, bleeding to the top and right edges. */}
      {l.twoCol ? <RosterBanner height={190} style={{ position: "absolute", top: -space.xl, right: -l.pad }} /> : null}
      <View style={l.twoCol ? { paddingTop: 52 } : undefined}>
        <PageHeader large={l.twoCol} title={tr("roster")} subtitle={tr("rosterSubtitle")} />
      </View>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <SegmentedControl
            options={[
              { id: "today" as const, label: tr("today"), icon: Sunrise },
              { id: "tomorrow" as const, label: tr("tomorrow"), icon: CalendarDays },
            ]}
            solid
            value={day}
            onChange={setDay}
          />
        </View>
        <IconButton icon={RefreshCw} label={tr("refresh")} onPress={() => void refreshHome()} />
      </View>
      {homeError ? <ErrorState message={homeError} onRetry={() => void refreshHome()} retryLabel={tr("retry")} /> : null}
      {!roster ? <EmptyState icon={RefreshCw} title={tr("loading")} /> : null}

      {roster ? (
        <Card elevated>
          {l.twoCol ? <RosterDateDeco height={132} style={styles.deco} /> : null}
          <View style={styles.dateRow}>
            {parts ? (
              <View style={styles.calendar} accessibilityLabel={`${parts.weekday} ${parts.day} ${parts.month}`}>
                <Text style={styles.calMonth}>{parts.month}</Text>
                <Text style={styles.calDay}>{parts.day}</Text>
              </View>
            ) : null}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.weekday}>{parts?.weekday ?? roster.date}</Text>
              {roster.published ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Clock size={18} color={colors.ink} />
                    <Text style={styles.shift}>
                      {roster.shiftStart ?? "—"} – {roster.shiftEnd ?? "—"}
                    </Text>
                  </View>
                  {roster.hub ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <MapPin size={14} color={colors.muted} />
                      <Text style={type.meta} numberOfLines={1}>
                        {roster.hub.name}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={styles.dateText}>{roster.date}</Text>
              )}
            </View>
          </View>
          {roster.published ? (
            <View style={styles.meta}>
              <Badge label={tr("stopsCount", { n: roster.stops.length })} tone="peach" />
              {roster.stops.length ? <Badge label={tr("stopsDone", { n: done, total: roster.stops.length })} tone={done === roster.stops.length ? "green" : "slate"} dot /> : null}
              {roster.updatedAt ? (
                <Text style={type.caption}>
                  {tr("rosterVersion", { time: new Date(roster.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), v: roster.version ?? 1 })}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Card>
      ) : null}

      {roster && !roster.published ? (
        <View style={styles.empty}>
          <RosterEmpty width={Math.min(462, l.width - l.pad * 2 - (l.sideNav ? l.sidebarWidth : 0))} />
          <Text style={styles.emptyTitle}>{tr("notPublished")}</Text>
          <Text style={styles.emptyBody}>{tr("notPublishedBody")}</Text>
        </View>
      ) : null}

      {roster && roster.published ? (
        roster.stops.length === 0 ? (
          <EmptyState icon={Route} title={tr("rosterNoStops")} />
        ) : (
          <Card>
            <SectionHeader title={tr("routeTitle")} icon={Route} count={roster.stops.length} />
            <RouteTimeline stops={roster.stops} currentTaskId={day === "today" ? home?.nextTask?.id : null} onOpen={openTask} detailed />
          </Card>
        )
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dateRow: { flexDirection: "row", alignItems: "center", gap: space.lg },
  calendar: { width: 104, borderRadius: radii.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: "center", ...(elevation[1] as object) },
  calMonth: { alignSelf: "stretch", textAlign: "center", backgroundColor: colors.primary, color: colors.white, fontWeight: "800", fontSize: 18, paddingVertical: 6, textTransform: "uppercase" },
  calDay: { fontSize: 36, fontWeight: "800", color: colors.ink, paddingVertical: 10, fontVariant: ["tabular-nums"] },
  weekday: { fontSize: 18, fontWeight: "500", color: colors.muted },
  dateText: { fontSize: 22, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"] },
  deco: { position: "absolute", right: 0, top: 0, bottom: 0 },
  empty: { alignItems: "center", gap: space.sm, paddingTop: space.xxl, paddingBottom: space.xxl },
  emptyTitle: { fontSize: 24, fontWeight: "800", color: colors.ink, textAlign: "center", letterSpacing: -0.4, marginTop: space.lg },
  emptyBody: { fontSize: 17, fontWeight: "500", color: colors.muted, textAlign: "center" },
  shift: { fontSize: 22, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"], letterSpacing: -0.4 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, marginTop: space.xs },
});
