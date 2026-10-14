import { Stack } from "expo-router";
import { useT } from "@/components/status";
import { colors } from "@/constants/theme";
import { headerOptions } from "@/constants/nav";

export default function OnboardLayout() {
  const tr = useT();
  return (
    <Stack
      screenOptions={{ ...headerOptions, contentStyle: { backgroundColor: colors.bg } }}
    >
      <Stack.Screen name="index" options={{ title: tr("onboardTitle"), headerShown: false }} />
      <Stack.Screen name="new" options={{ title: tr("newVisit") }} />
    </Stack>
  );
}
