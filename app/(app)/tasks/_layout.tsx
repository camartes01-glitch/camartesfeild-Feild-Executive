import { Stack } from "expo-router";
import { colors } from "@/constants/theme";

export default function TasksLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}>
      <Stack.Screen name="index" options={{ title: "Today’s run" }} />
      <Stack.Screen name="[id]" options={{ title: "Task" }} />
    </Stack>
  );
}
