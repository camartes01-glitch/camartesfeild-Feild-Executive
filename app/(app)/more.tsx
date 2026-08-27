import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { Button, Card, Muted, Title } from "@/components/ui";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";

const SUGGESTED = [
  { title: "Proof of delivery OTP", body: "4-digit code sent to the customer so kits cannot be marked delivered without the renter." },
  { title: "Serial barcode scan", body: "Scan body/lens QR at pickup and return to stop kit mix-ups between bookings." },
  { title: "Damage & deposit workflow", body: "Photograph dents on site, raise a ticket, hold security deposit until QC at the hub." },
  { title: "Route batching", body: "Group nearby Hyderabad stops into one run to cut km and overtime." },
  { title: "Offline queue", body: "Save photos and clock events when 4G drops, sync when back online." },
  { title: "Hub dispatcher console", body: "Live map of all executives, reassign tasks, and SLA timers." },
];

export default function MoreScreen() {
  const { user, resetDemo, logout } = useApp();

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Title>Profile & roadmap</Title>
      <Muted>
        {user?.name} · {user?.employeeId} · {user?.hub}
      </Muted>
      <Muted>{user?.email}</Muted>
      <Card>
        <Text style={styles.h}>Demo data</Text>
        <Muted>Login, shifts, leave and photos stay on this device. No production API is wired yet.</Muted>
        <Button
          label="Reset demo data"
          variant="outline"
          onPress={() => {
            resetDemo();
            Alert.alert("Restored", "Demo tasks and attendance restored.");
          }}
        />
        <Button
          label="Log out"
          variant="ghost"
          onPress={() => {
            logout();
            router.replace("/");
          }}
        />
      </Card>
      <Text style={styles.h}>Suggested next features</Text>
      {SUGGESTED.map((s) => (
        <Card key={s.title}>
          <Text style={{ fontWeight: "700" }}>{s.title}</Text>
          <Muted>{s.body}</Muted>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10, backgroundColor: colors.bg, paddingBottom: 40 },
  h: { fontSize: 16, fontWeight: "700", color: colors.text },
});
