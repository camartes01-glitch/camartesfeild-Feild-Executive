import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { DialogHost } from "@/components/dialog";
import { NavMonitor } from "@/components/nav-monitor";
import { AppProvider } from "@/lib/app-context";
import { colors } from "@/constants/theme";

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="(app)" />
      </Stack>
      <DialogHost />
      <NavMonitor />
    </AppProvider>
  );
}
