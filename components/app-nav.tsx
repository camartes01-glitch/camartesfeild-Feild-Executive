import type { ComponentProps } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

const LOGO = require("../assets/images/camartes-logo.png");
const LOGO_RATIO = 1446 / 617;
import type { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CloudOff, RefreshCw, CircleCheck, LogOut } from "lucide-react-native";
import { confirmDialog } from "@/components/dialog";
import { Avatar } from "@/components/ui";
import { useT } from "@/components/status";
import { colors, elevation, radii, space } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { useLayout } from "@/lib/responsive";
import { SidebarScene } from "@/components/brand-art";
import type { I18nKey } from "@/lib/i18n";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** Same tab press contract as the stock tab bar: emit tabPress (stacks pop to top on re-press), then navigate. */
function usePress(props: TabBarProps) {
  return (routeKey: string, routeName: string, focused: boolean) => {
    const event = props.navigation.emit({ type: "tabPress", target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) props.navigation.navigate(routeName);
  };
}

/**
 * App navigation. Phones/tablets: a floating white bar above the safe area. Laptops/desktops: a sidebar with the
 * brand, the sections and the signed-in employee with sync state.
 */
export function AppNav(props: TabBarProps) {
  const l = useLayout();
  return l.sideNav ? <Sidebar {...props} width={l.sidebarWidth} /> : <BottomBar {...props} />;
}

function BottomBar(props: TabBarProps) {
  const insets = useSafeAreaInsets();
  const press = usePress(props);
  const { state, descriptors } = props;
  return (
    <View style={[styles.bottomWrap, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      <View style={[styles.bottom, elevation[3]]} accessibilityRole="tablist">
        {state.routes.map((route, i) => {
          const { options } = descriptors[route.key]!;
          const focused = state.index === i;
          const label = typeof options.title === "string" ? options.title : route.name;
          const color = focused ? colors.primary : colors.muted;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => press(route.key, route.name, focused)}
              style={(s) => [styles.bottomItem, s.pressed && { opacity: 0.7 }, (s as { focused?: boolean }).focused && styles.focusRing]}
            >
              <View style={[styles.bottomIcon, focused && { backgroundColor: colors.primarySoft }]}>
                {options.tabBarIcon?.({ focused, color, size: 22 })}
              </View>
              <Text style={[styles.bottomLabel, { color }, focused && { fontWeight: "800" }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Sidebar(props: TabBarProps & { width: number }) {
  const press = usePress(props);
  const tr = useT();
  const { user, online, queueSummary, logout } = useApp();
  function signOut() {
    confirmDialog({
      title: tr("signOut"),
      message: queueSummary.unsynced ? tr("signOutUnsynced", { n: queueSummary.unsynced }) : tr("signOutConfirm"),
      confirm: tr("signOut"),
      cancel: tr("cancel"),
      destructive: true,
      onConfirm: () => logout(),
    });
  }
  const { state, descriptors, width } = props;
  const { height } = useWindowDimensions();
  const syncLabel = !online ? tr("offline") : queueSummary.unsynced ? tr("syncPending", { n: queueSummary.unsynced }) : tr("syncAllDone");
  const SyncIcon = !online ? CloudOff : queueSummary.unsynced ? RefreshCw : CircleCheck;
  const syncColor = !online ? colors.dangerInk : queueSummary.unsynced ? colors.warningInk : colors.successInk;
  return (
    <View style={[styles.side, { width }]}>
      <View style={styles.brand}>
        {/* Official Camartes logo (unchanged asset), kept at its native proportions. */}
        <Image source={LOGO} style={{ width: Math.min(190, width - 40), height: Math.min(190, width - 40) / LOGO_RATIO }} resizeMode="contain" accessibilityLabel="Camartes" />
        <Text style={styles.brandSub} numberOfLines={1}>
          {tr("employeeApp")}
        </Text>
      </View>

      <View style={{ gap: 4 }} accessibilityRole="tablist">
        {state.routes.map((route, i) => {
          const { options } = descriptors[route.key]!;
          const focused = state.index === i;
          const label = typeof options.title === "string" ? options.title : route.name;
          const color = focused ? colors.primaryDark : colors.ink;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => press(route.key, route.name, focused)}
              style={(s) => {
                const st = s as { pressed: boolean; hovered?: boolean; focused?: boolean };
                return [styles.sideItem, focused ? styles.sideItemOn : st.hovered && styles.sideItemHover, st.pressed && { opacity: 0.8 }, st.focused && styles.focusRing];
              }}
            >
              {focused ? <View style={styles.sideAccent} /> : null}
              {options.tabBarIcon?.({ focused, color: focused ? colors.primary : colors.muted, size: 21 })}
              <Text style={[styles.sideLabel, { color }, focused && { fontWeight: "800" }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Brand scene fills the free space above the employee card; dropped on short windows. */}
      <View style={{ flex: 1, justifyContent: "flex-end", marginHorizontal: -space.md, overflow: "hidden" }}>
        {height >= 820 ? <SidebarScene width={width} /> : null}
      </View>

      {user ? (
        <View style={styles.me}>
          <Avatar name={user.displayName} size={38} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.meName} numberOfLines={1}>
              {user.displayName}
            </Text>
            <Text style={styles.meRole} numberOfLines={1}>
              {user.employeeId} · {tr(`role_${user.role}` as I18nKey)}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={styles.sync} accessibilityLabel={syncLabel}>
        <SyncIcon size={15} color={syncColor} />
        <Text style={[styles.syncText, { color: syncColor }]} numberOfLines={1}>
          {syncLabel}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr("signOut")}
        onPress={signOut}
        style={(st) => [styles.signOut, (st as { hovered?: boolean }).hovered && styles.sideItemHover, st.pressed && { opacity: 0.8 }]}
      >
        <LogOut size={19} color={colors.ink} />
        <Text style={styles.sideLabel}>{tr("signOut")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomWrap: { backgroundColor: colors.bg, paddingHorizontal: space.md, paddingTop: space.xs },
  bottom: {
    flexDirection: "row",
    backgroundColor: colors.white,
    borderRadius: radii.lg + 2,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.xs,
    paddingVertical: 6,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  bottomItem: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: radii.md },
  bottomIcon: { width: 48, height: 30, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  bottomLabel: { fontSize: 12, fontWeight: "700" },
  side: { backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.line, paddingHorizontal: space.md, paddingTop: space.xl, paddingBottom: space.lg, gap: space.xl },
  brand: { gap: 4, paddingHorizontal: space.xs },
  brandName: { fontSize: 17, fontWeight: "800", color: colors.ink, letterSpacing: -0.3 },
  brandSub: { fontSize: 13, fontWeight: "600", color: colors.muted },
  sideItem: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 46, paddingHorizontal: space.md, borderRadius: radii.md, overflow: "hidden" },
  sideItemOn: { backgroundColor: colors.primarySoft },
  sideItemHover: { backgroundColor: colors.surfaceMuted },
  sideAccent: { position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: colors.primary },
  sideLabel: { fontSize: 15, fontWeight: "600" },
  me: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radii.md, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line },
  meName: { fontSize: 14, fontWeight: "800", color: colors.ink },
  meRole: { fontSize: 13, fontWeight: "500", color: colors.muted },
  signOut: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 46, paddingHorizontal: space.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line },
  sync: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.sm, marginTop: -space.md },
  syncText: { fontSize: 13, fontWeight: "700" },
  focusRing: Platform.select({ web: { outlineWidth: 2, outlineColor: colors.primary, outlineStyle: "solid", outlineOffset: -2 } as object, default: {} }),
});
