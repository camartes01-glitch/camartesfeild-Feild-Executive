import { useEffect } from "react";
import { Tabs, router } from "expo-router";
import { Home, ListChecks, Clock3, CalendarDays, Menu, Store } from "lucide-react-native";
import { useApp } from "@/lib/app-context";
import { colors } from "@/constants/theme";
import { t } from "@/lib/i18n";

export default function AppTabs() {
  const { ready, user, state } = useApp();
  const lang = state.language;

  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user]);

  if (!ready || !user) return null;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: "800" },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.peachBorder,
          height: 64,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontWeight: "700", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t(lang, "home"),
          tabBarIcon: ({ color }) => <Home size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: t(lang, "tasks"),
          headerShown: false,
          tabBarIcon: ({ color }) => <ListChecks size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="vendors"
        options={{
          title: t(lang, "vendors"),
          headerShown: false,
          tabBarIcon: ({ color }) => <Store size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: t(lang, "hours"),
          tabBarIcon: ({ color }) => <Clock3 size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: t(lang, "leave"),
          tabBarIcon: ({ color }) => <CalendarDays size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t(lang, "more"),
          tabBarIcon: ({ color }) => <Menu size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
