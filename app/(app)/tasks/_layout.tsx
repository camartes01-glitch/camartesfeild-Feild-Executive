import { Pressable, Text } from "react-native";
import { Stack } from "expo-router";
import { useT } from "@/components/status";
import { colors } from "@/constants/theme";
import { headerOptions } from "@/constants/nav";
import { backToJobs } from "@/lib/nav";

export const unstable_settings = { initialRouteName: "index" };

export default function JobsLayout() {
  const tr = useT();
  return (
    <Stack
      screenOptions={{ ...headerOptions, contentStyle: { backgroundColor: colors.bg } }}
    >
      {/* The list carries its own large title; job details keep the header with back navigation. */}
      <Stack.Screen name="index" options={{ title: tr("jobs"), headerShown: false }} />
      <Stack.Screen
        name="[id]"
        options={({ navigation }) => ({
          title: tr("openJob"),
          // A job opened from Home, Roster, Alerts or a link may be the only screen in this stack: still offer Jobs.
          // Only this stack's own history counts (canGoBack() would also count the tab history).
          headerLeft: (navigation.getState()?.index ?? 0) > 0
            ? undefined
            : () => (
                <Pressable accessibilityRole="button" accessibilityLabel={tr("backToJobs")} onPress={backToJobs} hitSlop={10} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ color: colors.primaryDark, fontWeight: "800", fontSize: 16 }}>‹ {tr("jobs")}</Text>
                </Pressable>
              ),
        })}
      />
    </Stack>
  );
}
