import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Card, Muted } from "@/components/ui";
import { MiniMap } from "@/components/mini-map";
import { SlaBadge } from "@/components/task-badges";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { slaState } from "@/lib/field-ops";
import { TEAM } from "@/lib/seed";

const STATUS: Record<string, string> = {
  on_shift: "On shift",
  off_shift: "Off shift",
  on_task: "On a run",
};

export default function HubScreen() {
  const { user, live, state } = useApp();
  const you = live ?? TEAM.find((m) => m.id === user?.id)?.geo ?? TEAM[0].geo;
  const slaRed = state.tasks.filter((t) => t.status !== "completed" && slaState(t).tone === "late");

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Muted>City manager view — live field executives and SLA-red jobs on the Hyderabad hub.</Muted>
      <MiniMap
        markers={[
          { id: "you", label: "You", color: colors.primary, point: you },
          ...TEAM.filter((m) => m.id !== user?.id).map((m) => ({
            id: m.id,
            label: m.name.split(" ")[0],
            color: colors.orange,
            point: m.geo,
          })),
          ...slaRed.map((t) => ({
            id: t.id,
            label: t.id.replace("TSK-", ""),
            color: "#B91C1C",
            point: t.customerPlace.geo,
          })),
        ]}
      />
      <Card>
        <Text style={styles.h}>SLA-red jobs</Text>
        {slaRed.length === 0 ? <Muted>No overdue open jobs.</Muted> : null}
        {slaRed.map((t) => (
          <Pressable key={t.id} onPress={() => router.push(`/(app)/tasks/${t.id}`)}>
            <View style={{ paddingVertical: 8, gap: 4 }}>
              <Text style={styles.name}>
                {t.id} · {t.customerPlace.area}
              </Text>
              <Muted>{t.title}</Muted>
              <SlaBadge task={t} />
            </View>
          </Pressable>
        ))}
      </Card>
      {TEAM.map((m) => (
        <Card key={m.id}>
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avTxt}>{m.name.split(" ").map((p) => p[0]).join("")}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {m.name}
                {m.id === user?.id ? " · you (live GPS)" : ""}
              </Text>
              <Muted>
                {m.employeeId} · {STATUS[m.status]} · {m.area}
              </Muted>
            </View>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, backgroundColor: colors.bg, paddingBottom: 40 },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avTxt: { color: "#fff", fontWeight: "800" },
  name: { fontWeight: "800", color: colors.ink, fontSize: 16 },
  h: { fontSize: 16, fontWeight: "800", color: colors.ink },
});
