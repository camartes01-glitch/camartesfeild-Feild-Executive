import { useEffect } from "react";
import { Tabs, router } from "expo-router";
import { Text } from "react-native";
import { useApp } from "@/lib/app-context";
import { colors } from "@/constants/theme";

export default function AppTabs() {
  const { ready, user } = useApp();

  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user]);

  if (!ready || !user) return null;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.peachBorder },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: () => <Text>⌂</Text> }} />
      <Tabs.Screen name="tasks" options={{ title: "Tasks", headerShown: false, tabBarIcon: () => <Text>☰</Text> }} />
      <Tabs.Screen name="attendance" options={{ title: "Hours", tabBarIcon: () => <Text>⏱</Text> }} />
      <Tabs.Screen name="leave" options={{ title: "Leave", tabBarIcon: () => <Text>📅</Text> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: () => <Text>⋯</Text> }} />
    </Tabs>
  );
}
