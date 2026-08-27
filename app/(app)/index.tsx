import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, Muted, Title } from "@/components/ui";
import { KindBadge, StatusBadge } from "@/components/task-badges";
import { MiniMap } from "@/components/mini-map";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { formatKm, haversineKm, pathKm } from "@/lib/geo";
import { formatDuration, monthStats, shiftMinutes } from "@/lib/hours";
import { LOCATION_PRESETS } from "@/lib/seed";

export default function HomeScreen() {
  const { user, state, live, locationMode, setLocationMode, clockIn, clockOut, openShift } = useApp();
  const openTasks = state.tasks.filter((t) => t.status !== "completed");
  const next = openTasks[0];
  const stats = monthStats(state.shifts);
  const you = live ?? { lat: 17.4126, lng: 78.4483 };
  const today = new Date().toISOString().slice(0, 10);
  const todayKm = pathKm(state.pings.filter((p) => p.at.slice(0, 10) === today));

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Muted>Hyderabad hub</Muted>
      <Title>Hello, {user?.name.split(" ")[0]}</Title>

      <Card>
        <Text style={styles.h}>Live location</Text>
        <MiniMap
          markers={[
            { id: "you", label: "You", color: colors.primary, point: you },
            ...(next
              ? [
                  { id: "store", label: "Store", color: colors.orange, point: next.store.geo },
                  { id: "cust", label: "Customer", color: colors.success, point: next.customerPlace.geo },
                ]
              : []),
          ]}
        />
        <Muted>
          {live
            ? `${live.lat.toFixed(5)}, ${live.lng.toFixed(5)} · ±${Math.round(live.accuracyM)} m · ${live.source}`
            : "Allow location, or simulate a Hyderabad pin."}
        </Muted>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {LOCATION_PRESETS.map((p) => {
            const id = p.id === "live" ? "gps" : p.id;
            const on = locationMode === id;
            return (
              <Button
                key={p.id}
                label={p.label}
                variant={on ? "primary" : "outline"}
                onPress={() => setLocationMode(id)}
              />
            );
          })}
        </ScrollView>
      </Card>

      <Card>
        <Text style={styles.h}>Attendance</Text>
        <Text style={styles.body}>
          {openShift ? `On shift · ${formatDuration(shiftMinutes(openShift))}` : "Off shift"}
        </Text>
        <Muted>
          {stats.days} days · {formatDuration(stats.minutes)} this month
        </Muted>
        {openShift ? (
          <Button label="Clock out" variant="outline" onPress={clockOut} />
        ) : (
          <Button label="Clock in" onPress={clockIn} />
        )}
      </Card>

      <View style={styles.row}>
        <Stat label="Open tasks" value={String(openTasks.length)} />
        <Stat label="Km today" value={formatKm(todayKm)} />
        <Stat label="Emp ID" value={user?.employeeId ?? "—"} />
      </View>

      {next ? (
        <Card>
          <Text style={styles.h}>Next stop</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            <KindBadge kind={next.kind} />
            <StatusBadge status={next.status} />
          </View>
          <Text style={styles.body}>{next.title}</Text>
          <Muted>{next.customerPlace.address}</Muted>
          <Muted>
            Store → customer {formatKm(haversineKm(next.store.geo, next.customerPlace.geo))}
            {live
              ? ` · you → next ${formatKm(
                  haversineKm(
                    live,
                    next.kind === "return" || next.kind === "address_verification"
                      ? next.customerPlace.geo
                      : next.store.geo,
                  ),
                )}`
              : ""}
          </Muted>
          <Button label="Open task" onPress={() => router.push(`/(app)/tasks/${next.id}`)} />
        </Card>
      ) : (
        <Card>
          <Muted>No open tasks. Check inventory or review leave.</Muted>
        </Card>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Muted>{label}</Muted>
      <Text style={styles.body}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, backgroundColor: colors.bg, paddingBottom: 40 },
  h: { fontSize: 16, fontWeight: "700", color: colors.text },
  body: { fontSize: 15, fontWeight: "600", color: colors.text },
  row: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderColor: colors.peachBorder, borderRadius: 12, padding: 10, backgroundColor: colors.white },
});
