import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, Field, Muted, Title } from "@/components/ui";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { calendarDaysInclusive, formatDay, leaveUsedByType } from "@/lib/hours";
import { t } from "@/lib/i18n";
import type { LeavePolicy } from "@/lib/types";

const TYPES: Array<keyof LeavePolicy> = ["casual", "sick", "earned"];

export default function LeaveScreen() {
  const { state, requestLeave } = useApp();
  const lang = state.language;
  const [type, setType] = useState<keyof LeavePolicy>("casual");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");

  const remaining = (lt: keyof LeavePolicy) => state.leavePolicy[lt] - leaveUsedByType(state.leaves, lt);

  const submit = () => {
    setErr("");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      setErr("Use YYYY-MM-DD");
      return;
    }
    if (to < from) {
      setErr("End date before start");
      return;
    }
    const days = calendarDaysInclusive(from, to);
    if (remaining(type) - days < 0) {
      setErr(`Only ${remaining(type)} ${type} days left this year.`);
      return;
    }
    requestLeave({ type, from, to, days, reason: reason.trim() || "Personal" });
    setFrom("");
    setTo("");
    setReason("");
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Title>{t(lang, "leave")}</Title>
      <Muted>{t(lang, "leaveBalance")} · pending requests count against the balance</Muted>
      <View style={styles.stats}>
        <Stat label="Casual" value={String(remaining("casual"))} hint={`of ${state.leavePolicy.casual}`} />
        <Stat label="Sick" value={String(remaining("sick"))} hint={`of ${state.leavePolicy.sick}`} />
        <Stat label="Earned" value={String(remaining("earned"))} hint={`of ${state.leavePolicy.earned}`} />
      </View>
      <Card>
        <Text style={styles.h}>New request</Text>
        <View style={styles.chips}>
          {TYPES.map((lt) => (
            <Pressable key={lt} onPress={() => setType(lt)} style={[styles.chip, type === lt && styles.chipOn]}>
              <Text style={[styles.chipTxt, type === lt && styles.chipTxtOn]}>{lt}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="From" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" />
        <Field label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" />
        <Field label="Reason" value={reason} onChangeText={setReason} placeholder="Family / travel / sick" />
        {err ? <Text style={styles.err}>{err}</Text> : null}
        <Button label="Submit to HR" onPress={submit} />
      </Card>
      {state.leaves.length === 0 ? (
        <Muted>No leave filed this year.</Muted>
      ) : (
        state.leaves.map((l) => (
          <Card key={l.id}>
            <Text style={styles.body}>
              {l.type} · {l.days}d · {l.status}
            </Text>
            <Muted>
              {formatDay(l.from)} → {formatDay(l.to)}
            </Muted>
            <Muted>{l.reason}</Muted>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.stat}>
      <Muted>{label}</Muted>
      <Text style={styles.body}>{value}</Text>
      <Muted>{hint}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, backgroundColor: colors.bg, paddingBottom: 48 },
  h: { fontSize: 16, fontWeight: "800", color: colors.ink },
  body: { fontSize: 15, fontWeight: "700", color: colors.ink, textTransform: "capitalize" },
  stats: { flexDirection: "row", gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.peachBorder,
  },
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.peach,
  },
  chipOn: { backgroundColor: colors.primary },
  chipTxt: { fontWeight: "700", color: colors.ink, textTransform: "capitalize" },
  chipTxtOn: { color: "#fff" },
  err: { color: colors.danger, fontWeight: "600" },
});
