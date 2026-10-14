import { View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, House, ListChecks, Store, UserRound } from "lucide-react-native";
import { AppNav } from "@/components/app-nav";
import { SyncBar, useT } from "@/components/status";
import { useApp } from "@/lib/app-context";
import { colors, space } from "@/constants/theme";
import { headerOptions } from "@/constants/nav";
import { useLayout } from "@/lib/responsive";

export default function AppTabs() {
  const { ready, user } = useApp();
  const tr = useT();
  const l = useLayout();
  const insets = useSafeAreaInsets();

  // Declarative auth gate. Navigating imperatively from an effect while returning null unmounted the
  // tab navigator mid-navigation and looped (crash on sign-out).
  if (!ready) return null;
  // The sign-in screen lives at /login: "/" is this group's Home tab, so redirecting there would loop.
  if (!user) return <Redirect href="/login" />;
  if (user.role === "operations_manager") return <Redirect href="/admin" />;

  // Phones/tablets: floating bottom bar. Laptops/desktops: sidebar (see components/app-nav).
  const side = l.sideNav;
  // Height of the floating bar: wrapper top padding + bar + safe-area padding.
  const barHeight = 70 + Math.max(insets.bottom, space.sm);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        tabBar={(props) => <AppNav {...props} />}
        screenOptions={{
          ...headerOptions,
          tabBarPosition: side ? "left" : "bottom",
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
        }}
      >
        {/* Home, Roster and Profile carry their own large titles in the page. */}
        <Tabs.Screen name="index" options={{ title: tr("home"), headerShown: false, tabBarIcon: ({ color }) => <House size={22} color={color} /> }} />
        <Tabs.Screen name="tasks" options={{ title: tr("jobs"), headerShown: false, tabBarIcon: ({ color }) => <ListChecks size={22} color={color} /> }} />
        <Tabs.Screen name="onboard" options={{ title: tr("onboard"), headerShown: false, tabBarIcon: ({ color }) => <Store size={22} color={color} /> }} />
        <Tabs.Screen name="roster" options={{ title: tr("roster"), headerShown: false, tabBarIcon: ({ color }) => <CalendarDays size={22} color={color} /> }} />
        <Tabs.Screen name="profile" options={{ title: tr("profile"), headerShown: false, tabBarIcon: ({ color }) => <UserRound size={22} color={color} /> }} />
      </Tabs>
      <View style={{ position: "absolute", left: side ? l.sidebarWidth : 0, right: 0, bottom: side ? 0 : barHeight }} pointerEvents="box-none">
        <SyncBar />
      </View>
    </View>
  );
}
