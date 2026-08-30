import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Card, Muted } from "@/components/ui";
import { Chip } from "@/components/chips";
import { KindBadge, SlaBadge, StatusBadge } from "@/components/task-badges";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { checkInTarget } from "@/lib/field-ops";
import { formatKm, haversineKm } from "@/lib/geo";
import { formatWhen } from "@/lib/hours";
import type { TaskKind } from "@/lib/types";

const FILTERS: { id: "all" | TaskKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "address_verification", label: "Verify" },
  { id: "delivery", label: "Deliver" },
  { id: "return", label: "Return" },
  { id: "inventory", label: "Stock" },
  { id: "vendor_visit", label: "Vendor" },
];

export default function TasksScreen() {
  const { state, live } = useApp();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | TaskKind>("all");
  const [tab, setTab] = useState<"open" | "done">("open");

  const list = useMemo(() => {
    return state.tasks
      .filter((t) => {
        const open = t.status !== "completed";
        if (tab === "open" && !open) return false;
        if (tab === "done" && open) return false;
        if (kind !== "all" && t.kind !== kind) return false;
        const blob = `${t.title} ${t.customerName} ${t.bookingRef} ${t.customerPlace.area}`.toLowerCase();
        if (q && !blob.includes(q.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => (a.beatSeq ?? 99) - (b.beatSeq ?? 99) || a.scheduledFor.localeCompare(b.scheduledFor));
  }, [state.tasks, q, kind, tab]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Muted>Address checks, store pickups, deliveries, returns and hub counts.</Muted>
      <TextInput
        nativeID="task-search"
        accessibilityLabel="Search tasks by customer, booking, or area"
        placeholder="Search customer, booking, area…"
        value={q}
        onChangeText={setQ}
        style={styles.search}
      />
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: tab === "open" }}
          onPress={() => setTab("open")}
          style={[styles.tab, tab === "open" && styles.tabOn]}
        >
          <Text style={tab === "open" ? styles.tabOnText : styles.tabText}>Open</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: tab === "done" }}
          onPress={() => setTab("done")}
          style={[styles.tab, tab === "done" && styles.tabOn]}
        >
          <Text style={tab === "done" ? styles.tabOnText : styles.tabText}>Completed</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {FILTERS.map((f) => (
          <Chip key={f.id} label={f.label} selected={kind === f.id} onPress={() => setKind(f.id)} />
        ))}
      </ScrollView>
      {list.length === 0 ? (
        <Card>
          <Muted>No tasks in this view.</Muted>
        </Card>
      ) : (
        list.map((t) => {
          const youDist = live
            ? haversineKm(live, checkInTarget(t))
            : null;
          return (
            <Pressable key={t.id} onPress={() => router.push(`/(app)/tasks/${t.id}`)}>
              <Card accent={false}>
                <View style={styles.jobRow}>
                  <View style={styles.num}>
                    <Text style={styles.numTxt}>{t.beatSeq ?? "–"}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.body} numberOfLines={2}>
                      {t.customerPlace.area} · {t.customerName}
                    </Text>
                    <Muted>
                      {t.beatWindow ?? formatWhen(t.scheduledFor)}
                      {youDist != null ? ` · ${formatKm(youDist)} away` : ""}
                    </Muted>
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                      <KindBadge kind={t.kind} />
                      <StatusBadge status={t.status} />
                      <SlaBadge task={t} />
                    </View>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10, backgroundColor: colors.bg, paddingBottom: 40 },
  body: { fontSize: 16, fontWeight: "700", color: colors.text },
  search: {
    borderWidth: 1,
    borderColor: colors.peachBorder,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
  },
  row: { flexDirection: "row", gap: 8 },
  tab: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: colors.peach, alignItems: "center" },
  tabOn: { backgroundColor: colors.primary },
  tabText: { color: colors.text, fontWeight: "600" },
  tabOnText: { color: "#fff", fontWeight: "600" },
  jobRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  num: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  numTxt: { color: "#fff", fontWeight: "800" },
});
