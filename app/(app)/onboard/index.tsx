import { useCallback, useState } from "react";
import { FlatList, ImageBackground, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ArrowRight, Aperture, CalendarClock, Camera, Clapperboard, MonitorPlay, Palette, Plus, Radio, RefreshCw, Store, Video, type LucideIcon } from "lucide-react-native";
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, IconCircle, PageHeader } from "@/components/ui";
import { useT } from "@/components/status";
import { colors, elevation, radii, space, type } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { errorText, type I18nKey } from "@/lib/i18n";
import { OPS } from "@/lib/ops-api";
import { useLayout } from "@/lib/responsive";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ONBOARD_CTA, OnboardBanner, OnboardEmpty } from "@/components/brand-art";
import type { OnboardingVisit, PartnerType } from "@/lib/types";

const TYPE_ICON: Record<PartnerType, LucideIcon> = {
  PHOTOGRAPHY_STUDIO: Aperture,
  FREELANCE_PHOTOGRAPHER: Camera,
  VIDEOGRAPHER: Video,
  ALBUM_DESIGNER: Palette,
  VIDEO_EDITOR: Clapperboard,
  LED_WALL_PARTNER: MonitorPlay,
  WEBLIVE_PARTNER: Radio,
};

export default function OnboardScreen() {
  const { get, online, queue, language, retryQueued, discardQueued } = useApp();
  const tr = useT();
  const l = useLayout();
  const insets = useSafeAreaInsets();
  const [visits, setVisits] = useState<OnboardingVisit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await get<{ visits: OnboardingVisit[] }>(`${OPS}/onboard/visits?limit=100`);
    setLoading(false);
    setLoaded(true);
    if (res.ok) {
      setVisits(res.body.visits);
      setError(null);
    } else {
      setError(errorText(language, res.code, res.message));
    }
  }, [get, language]);

  // Reload whenever the screen regains focus (e.g. back from saving a visit or finishing a job) and on reconnect.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, online]),
  );

  const unsynced = queue.filter((q) => q.path.includes("/onboard/visits") && q.status !== "SYNCED");
  const cols = l.isWide ? 3 : l.twoCol ? 2 : 1;

  return (
    <FlatList
      key={`cols-${cols}`}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingHorizontal: l.pad, paddingTop: insets.top + space.lg, paddingBottom: l.sideNav ? space.xxl : 110, gap: space.md, width: "100%", maxWidth: l.maxWidth, alignSelf: "center" }}
      data={visits}
      numColumns={cols}
      columnWrapperStyle={cols > 1 ? { gap: space.md } : undefined}
      keyExtractor={(v) => v.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListHeaderComponent={
        <View style={{ gap: space.md, marginBottom: space.sm }}>
          {/* Wide screens: camera-store banner behind the header, bleeding to the top and right edges. */}
          {l.twoCol ? <OnboardBanner height={232} style={{ position: "absolute", top: -(insets.top + space.lg), right: -l.pad }} /> : null}
          <View style={l.twoCol ? { paddingTop: 56 } : undefined}>
            <PageHeader
              large={l.twoCol}
              title={tr("onboardTitle")}
              subtitle={tr("onboardSubtitle")}
              right={l.twoCol ? undefined : <IconButton icon={RefreshCw} label={tr("refresh")} onPress={() => void load()} />}
            />
          </View>
          {/* Wide screens: refresh stays pinned to the top-right corner over the banner. */}
          {l.twoCol ? (
            <View style={{ position: "absolute", top: 0, right: 0 }}>
              <IconButton icon={RefreshCw} label={tr("refresh")} onPress={() => void load()} />
            </View>
          ) : null}
          <View style={l.twoCol ? { marginTop: space.xxxl + space.xs } : undefined}>
            <LogVisitBar label={tr("newVisit")} onPress={() => router.push("/(app)/onboard/new")} />
          </View>
          {error ? <ErrorState message={error} onRetry={() => void load()} retryLabel={tr("retry")} /> : null}
          {unsynced.map((q) => (
            <Card key={q.id} tone={q.status === "FAILED" ? "danger" : "muted"}>
              <View style={styles.rowBetween}>
                <Text style={[type.heading, { flex: 1 }]} numberOfLines={1}>
                  {String(q.body.businessName ?? q.label)}
                </Text>
                <Badge label={q.status === "FAILED" ? tr("rejected") : tr("pendingSync")} tone={q.status === "FAILED" ? "red" : "blue"} dot />
              </View>
              {q.status === "FAILED" ? (
                <>
                  <Text style={type.meta}>{errorText(language, q.lastCode, q.lastError ?? "")}</Text>
                  <View style={styles.row}>
                    <Button compact flex={1} label={tr("retry")} variant="secondary" onPress={() => retryQueued(q.id)} />
                    <Button compact flex={1} label={tr("discard")} variant="ghost" onPress={() => discardQueued(q.id)} />
                  </View>
                </>
              ) : null}
            </Card>
          ))}
          <Text style={[type.heading, { marginTop: space.lg }, l.twoCol && { fontSize: 28, letterSpacing: -0.6 }]}>{tr("myVisits")}</Text>
        </View>
      }
      ListEmptyComponent={
        loaded && !error ? (
          <View style={styles.empty}>
            <OnboardEmpty width={Math.min(476, l.width - l.pad * 2 - (l.sideNav ? l.sidebarWidth : 0))} />
            <Text style={[styles.emptyTitle, l.isPhone && { fontSize: 22 }]}>{tr("noVisits")}</Text>
            <Text style={styles.emptyBody}>{tr("noVisitsBody")}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("newVisit")}
              onPress={() => router.push("/(app)/onboard/new")}
              style={(st) => [styles.pill, elevation[2], st.pressed && { transform: [{ scale: 0.98 }] }]}
            >
              <Plus size={20} color={colors.white} />
              <Text style={styles.pillText}>{tr("newVisit")}</Text>
              <ArrowRight size={20} color={colors.white} />
            </Pressable>
          </View>
        ) : !loaded ? (
          <EmptyState icon={RefreshCw} title={tr("loading")} />
        ) : null
      }
      renderItem={({ item }) => {
        const pt = item.partner?.partnerType;
        return (
          <View style={{ flex: 1 / cols }}>
            <Card>
              <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
                <IconCircle icon={(pt && TYPE_ICON[pt]) || Store} tone={item.visitStatus === "ONBOARDED" ? "green" : "peach"} size={42} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={type.heading} numberOfLines={2}>
                    {item.partner?.businessName}
                  </Text>
                  <Text style={type.meta} numberOfLines={1}>
                    {tr(`ptype_${pt}` as I18nKey)} · {item.partner?.contactPerson}
                  </Text>
                </View>
              </View>
              <View style={styles.row}>
                <Badge
                  label={tr(`status_${item.visitStatus}` as I18nKey)}
                  tone={item.visitStatus === "ONBOARDED" ? "green" : item.visitStatus === "NOT_INTERESTED" ? "slate" : "peach"}
                  dot
                />
                <Badge label={item.gstAvailable ? `GST ${item.gstNumber ?? ""}` : tr("gstNo")} tone="slate" />
              </View>
              {item.nextMeetingAt ? (
                <Badge
                  icon={CalendarClock}
                  tone="blue"
                  label={tr("followUpOn", { date: new Date(item.nextMeetingAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) })}
                />
              ) : null}
              <View style={styles.rowBetween}>
                <Text style={type.caption}>{new Date(item.visitedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</Text>
                {item.partner ? (
                  <Button
                    compact
                    label={tr("logAnotherVisit")}
                    variant="plain"
                    onPress={() => router.push({ pathname: "/(app)/onboard/new", params: { partnerId: item.partner!.id } })}
                  />
                ) : null}
              </View>
            </Card>
          </View>
        );
      }}
    />
  );
}

/** Full-width orange call to action with the soft wave/camera artwork. */
function LogVisitBar({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={(st) => [styles.bar, elevation[2], st.pressed && { transform: [{ scale: 0.99 }] }]}>
      <ImageBackground source={ONBOARD_CTA} resizeMode="cover" style={styles.barBg} imageStyle={{ borderRadius: radii.md + 2 }}>
        <View style={{ width: 52 }} />
        <View style={styles.barCenter}>
          <Plus size={24} color={colors.white} />
          <Text style={styles.barText}>{label}</Text>
        </View>
        <View style={styles.barArrow}>
          <ArrowRight size={22} color={colors.white} />
        </View>
      </ImageBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: radii.md + 2, backgroundColor: colors.primary, overflow: "hidden" },
  barBg: { minHeight: 72, flexDirection: "row", alignItems: "center", paddingHorizontal: space.md },
  barCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.md },
  barText: { fontSize: 24, fontWeight: "800", color: colors.white, letterSpacing: -0.3 },
  barArrow: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: space.sm, paddingTop: space.lg, paddingBottom: space.xxl },
  emptyTitle: { fontSize: 28, fontWeight: "800", color: colors.ink, letterSpacing: -0.6, marginTop: space.md, textAlign: "center" },
  emptyBody: { fontSize: 17, fontWeight: "500", color: colors.muted, textAlign: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.primary, borderRadius: radii.md + 4, minHeight: 60, paddingHorizontal: space.xxl, marginTop: space.lg },
  pillText: { fontSize: 19, fontWeight: "800", color: colors.white },
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap", alignItems: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
});
