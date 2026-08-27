import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Muted } from "@/components/ui";
import { MiniMap } from "@/components/mini-map";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { TEAM } from "@/lib/seed";

const STATUS: Record<string, string> = {
  on_shift: "On shift",
  off_shift: "Off shift",
  on_task: "On a run",
};

export default function HubScreen() {
  const { user, live } = useApp();
  const you = live ?? TEAM.find((m) => m.id === user?.id)?.geo ?? TEAM[0].geo;

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Muted>Camartes employees on the Hyderabad hub today — dispatcher view.</Muted>
      <MiniMap
        markers={[
          { id: "you", label: "You", color: colors.primary, point: you },
          ...TEAM.filter((m) => m.id !== user?.id).map((m) => ({
            id: m.id,
            label: m.name.split(" ")[0],
            color: colors.orange,
            point: m.geo,
          })),
        ]}
      />
      {TEAM.map((m) => (
        <Card key={m.id}>
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avTxt}>{m.name.split(" ").map((p) => p[0]).join("")}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {m.name}
                {m.id === user?.id ? " · you" : ""}
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
});
