import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProvider } from "@/lib/app-context";
import { colors } from "@/constants/theme";

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="hub" options={{ headerShown: true, title: "Hyderabad hub team", headerStyle: { backgroundColor: colors.primary }, headerTintColor: "#fff" }} />
        <Stack.Screen name="expenses" options={{ headerShown: true, title: "Travel expenses", headerStyle: { backgroundColor: colors.primary }, headerTintColor: "#fff" }} />
        <Stack.Screen name="training" options={{ headerShown: true, title: "Kit care", headerStyle: { backgroundColor: colors.primary }, headerTintColor: "#fff" }} />
      </Stack>
    </AppProvider>
  );
}
