import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ClipboardCheck, Inbox, RefreshCw, Search, X } from "lucide-react-native";
import { JobCard, JobCardSkeleton } from "@/components/job-card";
import { JobsBanner } from "@/components/brand-art";
import { Text } from "react-native";
import { EmptyState, ErrorState, IconButton, PageHeader, SegmentedControl } from "@/components/ui";
import { isBreached, useT, useTick } from "@/components/status";
import { colors, radii, space } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { clockOffsetMs, orderTasks } from "@/lib/field-ops";
import { haversineKm } from "@/lib/geo";
import { OPS } from "@/lib/ops-api";
import { useLayout } from "@/lib/responsive";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Task } from "@/lib/types";

type ListBody = { tasks: Task[]; total: number; serverTime: string };

export default function JobsScreen() {
  const { get, home, online, queue, live, config } = useApp();
  const tr = useT();
  const l = useLayout();
  const insets = useSafeAreaInsets();
  useTick(30_000);
  const [scope, setScope] = useState<"open" | "closed">("open");
  const [rows, setRows] = useState<Task[] | null>(null);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await get<ListBody>(`${OPS}/tasks?scope=${scope}&limit=100`);
    setLoading(false);
    if (res.ok) {
      setRows(orderTasks(res.body.tasks));
      setServerTime(res.body.serverTime);
      setError(null);
    } else {
      setError(res.message);
    }
  }, [get, scope]);

  // Reload whenever the screen regains focus (e.g. back from saving a visit or finishing a job) and on reconnect.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, online]),
  );

  // Offline: fall back to the open tasks cached with the home summary.
  const data = rows ?? (scope === "open" ? orderTasks(home?.openTasks ?? []) : []);
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      !q
        ? data
        : data.filter((t) => [t.taskCode, t.title, t.stop?.name, t.stop?.address, t.area, t.customerName].some((v) => (v ?? "").toLowerCase().includes(q))),
    [data, q],
  );
  // Two cards side by side whenever there is room (reference layout); one column on phones.
  const cols = l.twoCol ? 2 : 1;
  const offset = clockOffsetMs(serverTime ?? home?.serverTime ?? null);

  const header = (
    <View style={{ gap: space.md, marginBottom: space.sm }}>
      {/* Wide screens: sunset camera-kit banner behind the header, bleeding to the top and right edges. */}
      {l.twoCol ? <JobsBanner height={258} style={{ position: "absolute", top: -(insets.top + space.lg), right: -l.pad }} /> : null}
      <PageHeader
        large={l.twoCol}
        title={tr("jobs")}
        subtitle={scope === "open" && (rows ?? home?.openTasks) ? tr("jobsSubtitle", { n: (rows ?? home?.openTasks ?? []).length }) : undefined}
        right={<IconButton icon={RefreshCw} label={tr("refresh")} onPress={() => void load()} />}
      />
      {l.twoCol ? <Text style={styles.intro}>{tr("jobsIntro")}</Text> : null}
      <View style={styles.toolbar}>
        <View style={{ flex: 1, maxWidth: l.isPhone ? undefined : 585 }}>
          <SegmentedControl
            options={[
              { id: "open" as const, label: tr("openTab"), count: scope === "open" && rows ? rows.length : home?.openTasks.length },
              { id: "closed" as const, label: tr("closedTab"), count: scope === "closed" && rows ? rows.length : undefined },
            ]}
            value={scope}
            accent
            onChange={(id) => {
              if (id === scope) return;
              setRows(null);
              setScope(id);
            }}
          />
        </View>
      </View>
      <View style={styles.search}>
        <Search size={18} color={colors.faint} />
        <TextInput
          accessibilityLabel={tr("searchJobs")}
          placeholder={l.isPhone ? tr("searchJobs") : tr("searchJobsHint")}
          placeholderTextColor={colors.faint}
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {query ? <IconButton icon={X} label={tr("clear")} onPress={() => setQuery("")} size={36} /> : null}
      </View>
      {error ? <ErrorState message={rows || data.length ? tr("showingSaved", { reason: error }) : error} onRetry={() => void load()} retryLabel={tr("retry")} /> : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        key={`cols-${cols}`}
        data={shown}
        numColumns={cols}
        keyExtractor={(task) => task.id}
        columnWrapperStyle={cols > 1 ? { gap: space.md } : undefined}
        contentContainerStyle={{ paddingHorizontal: l.pad, paddingTop: insets.top + space.lg, paddingBottom: l.sideNav ? space.xxl : 110, gap: space.md, width: "100%", maxWidth: Math.min(l.maxWidth, 1450), alignSelf: "center" }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading && !rows ? (
            <View style={{ gap: space.md }}>
              <JobCardSkeleton />
              <JobCardSkeleton />
            </View>
          ) : error && !rows ? null : q ? (
            <EmptyState icon={Search} title={tr("noSearchResults")} body={tr("noSearchResultsBody")} />
          ) : (
            <EmptyState
              icon={scope === "open" ? ClipboardCheck : Inbox}
              title={scope === "open" ? tr("jobsEmpty") : tr("jobsClosedEmpty")}
              body={scope === "open" ? tr("jobsEmptyBody") : undefined}
            />
          )
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1 / cols }}>
            <JobCard
              task={item}
              serverTime={serverTime ?? home?.serverTime ?? null}
              distanceKm={live && item.stop ? haversineKm(live, item.stop) : null}
              pending={queue.some((q) => q.entityKey === `task:${item.id}` && q.status !== "SYNCED")}
              breached={isBreached(item, offset, config?.rules.slaAtRiskMin ?? 45)}
              onPress={() => router.push(`/(app)/tasks/${item.id}`)}
              rich={l.width >= 1400}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  intro: { fontSize: 17, fontWeight: "500", color: colors.muted, marginTop: -space.md, maxWidth: 600 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: space.sm },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    minHeight: 56,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 10 },
});
