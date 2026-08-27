import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Badge, Button, Card, Muted, Title } from "@/components/ui";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { leaveDaysUsed } from "@/lib/hours";
import type { LeaveType } from "@/lib/types";

const ALLOWANCE = 18;
const TYPES: LeaveType[] = ["casual", "sick", "earned", "unpaid"];

export default function LeaveScreen() {
  const { state, requestLeave } = useApp();
  const [type, setType] = useState<LeaveType>("casual");
  const [from, setFrom] = useState("2026-08-29");
  const [to, setTo] = useState("2026-08-29");
  const [reason, setReason] = useState("");
  const used = leaveDaysUsed(state.leaves);
  const pending = state.leaves.filter((l) => l.status === "pending").reduce((a, l) => a + l.days, 0);

  const leaveDates = useMemo(() => {
    const set = new Set<string>();
    for (const l of state.leaves) {
      if (l.status === "rejected") continue;
      const start = parseISO(l.from);
      const end = parseISO(l.to);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        set.add(format(d, "yyyy-MM-dd"));
      }
    }
    return set;
  }, [state.leaves]);

  function submit() {
    const start = parseISO(from);
    const end = parseISO(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      Alert.alert("Dates", "Use YYYY-MM-DD.");
      return;
    }
    const days = differenceInCalendarDays(end, start) + 1;
    if (days < 1) {
      Alert.alert("Dates", "End date must be on or after start.");
      return;
    }
    if (!reason.trim()) {
      Alert.alert("Reason", "Add a short reason for dispatch.");
      return;
    }
    requestLeave({ type, from, to, days, reason: reason.trim() });
    setReason("");
    Alert.alert("Sent", "Leave request sent to hub manager.");
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Title>Leave planner</Title>
      <Muted>
        {used} approved days used of {ALLOWANCE}. {pending} day(s) pending.
      </Muted>
      <Card>
        <Text style={styles.h}>Worked vs leave</Text>
        <Muted>Worked days: {state.shifts.length}. Leave days marked: {leaveDates.size}.</Muted>
      </Card>
      <Card>
        <Text style={styles.h}>New request</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {TYPES.map((t) => (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={[styles.chip, type === t && { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: type === t ? "#fff" : colors.text, textTransform: "capitalize" }}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput value={from} onChangeText={setFrom} placeholder="From YYYY-MM-DD" style={styles.input} />
        <TextInput value={to} onChangeText={setTo} placeholder="To YYYY-MM-DD" style={styles.input} />
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Why you need the day off"
          style={[styles.input, { minHeight: 70 }]}
          multiline
        />
        <Button label="Submit request" onPress={submit} />
      </Card>
      {state.leaves.map((l) => (
        <Card key={l.id}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Text style={{ fontWeight: "700", textTransform: "capitalize" }}>{l.type}</Text>
            <Badge
              label={l.status}
              tone={l.status === "approved" ? "green" : l.status === "rejected" ? "default" : "peach"}
            />
            <Muted>{l.days}d</Muted>
          </View>
          <Muted>
            {l.from}
            {l.to !== l.from ? ` → ${l.to}` : ""} · {l.reason}
          </Muted>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10, backgroundColor: colors.bg, paddingBottom: 40 },
  h: { fontSize: 16, fontWeight: "700", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.peachBorder,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fff",
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.peachBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
});
