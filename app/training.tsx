import { ScrollView, StyleSheet, Text } from "react-native";
import { Button, Card, Muted } from "@/components/ui";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";

export default function TrainingScreen() {
  const { state, markTraining } = useApp();

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Muted>Mandatory kit-care modules for Camartes field employees.</Muted>
      {state.training.map((m) => (
        <Card key={m.id}>
          <Text style={styles.title}>{m.title}</Text>
          <Muted>{m.body}</Muted>
          {m.done ? (
            <Text style={styles.done}>Completed</Text>
          ) : (
            <Button label="Mark complete" variant="outline" onPress={() => markTraining(m.id)} />
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, backgroundColor: colors.bg, paddingBottom: 40 },
  title: { fontWeight: "800", color: colors.ink, fontSize: 16 },
  done: { color: colors.success, fontWeight: "800" },
});
