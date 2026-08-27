import { ScrollView, StyleSheet, Text, View } from "react-native";
import { format, parseISO } from "date-fns";
import { Button, Card, Muted, Title } from "@/components/ui";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { formatDuration, monthStats, shiftMinutes } from "@/lib/hours";

const TARGET_DAYS = 22;
const TARGET_MINUTES = 22 * 8 * 60;

export default function AttendanceScreen() {
  const { state, openShift, clockIn, clockOut, live } = useApp();
  const stats = monthStats(state.shifts);
  const sorted = [...state.shifts].sort((a, b) => b.clockIn.localeCompare(a.clockIn));

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Title>Attendance & hours</Title>
      <Muted>Clock in/out with GPS. Totals are for this month so far.</Muted>
      <Card>
        <Text style={styles.body}>
          {openShift ? `On shift · ${formatDuration(shiftMinutes(openShift))}` : "You are off shift"}
        </Text>
        <Muted>
          {live
            ? `Fix ${live.lat.toFixed(5)}, ${live.lng.toFixed(5)} will be stored on clock ${openShift ? "out" : "in"}.`
            : "Turn on location to geotag attendance."}
        </Muted>
        {openShift ? (
          <Button label="Clock out" variant="outline" onPress={clockOut} />
        ) : (
          <Button label="Clock in" onPress={clockIn} />
        )}
      </Card>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Card>
          <Muted>Working days</Muted>
          <Text style={styles.big}>{stats.days}</Text>
          <Muted>of {TARGET_DAYS} expected</Muted>
        </Card>
        <Card>
          <Muted>Hours</Muted>
          <Text style={styles.big}>{formatDuration(stats.minutes)}</Text>
          <Muted>of {formatDuration(TARGET_MINUTES)} target</Muted>
        </Card>
      </View>
      {sorted.map((s) => (
        <Card key={s.id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={styles.body}>{format(parseISO(s.clockIn), "EEE, d MMM")}</Text>
            <Text>{formatDuration(shiftMinutes(s))}</Text>
          </View>
          <Muted>
            In {format(parseISO(s.clockIn), "h:mm a")}
            {s.clockOut ? ` · Out ${format(parseISO(s.clockOut), "h:mm a")}` : " · still open"}
          </Muted>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10, backgroundColor: colors.bg, paddingBottom: 40 },
  body: { fontSize: 16, fontWeight: "700", color: colors.text },
  big: { fontSize: 28, fontWeight: "800", color: colors.text },
});
