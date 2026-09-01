import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, Field, Muted } from "@/components/ui";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { format } from "date-fns";

export default function ExpensesScreen() {
  const { myExpenses, addExpense } = useApp();
  const [note, setNote] = useState("");
  const [km, setKm] = useState("");
  const [amt, setAmt] = useState("");

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Muted>Cab, metro and packing claims file to Camartes payroll — employee only.</Muted>
      <Card>
        <Field label="What was it?" value={note} onChangeText={setNote} placeholder="Auto to Jubilee Hills" />
        <Field label="Km" value={km} onChangeText={setKm} keyboardType="decimal-pad" placeholder="12.4" />
        <Field label="Amount ₹" value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="180" />
        <Button
          label="Submit claim"
          onPress={() => {
            const amountInr = Number(amt);
            const distance = Number(km);
            if (!note.trim() || !amountInr) return;
            addExpense({
              date: format(new Date(), "yyyy-MM-dd"),
              km: Number.isFinite(distance) ? distance : 0,
              amountInr,
              note: note.trim(),
            });
            setNote("");
            setKm("");
            setAmt("");
          }}
        />
      </Card>
      {myExpenses.map((e) => (
        <Card key={e.id}>
          <View style={styles.row}>
            <Text style={styles.title}>{e.note}</Text>
            <Text style={styles.amt}>₹{e.amountInr}</Text>
          </View>
          <Muted>
            {e.date} · {e.km} km · {e.status}
          </Muted>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, backgroundColor: colors.bg, paddingBottom: 40 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  title: { fontWeight: "700", color: colors.ink, flex: 1 },
  amt: { fontWeight: "800", color: colors.primaryDark },
});
