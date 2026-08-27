import { Stack } from "expo-router";
import { colors } from "@/constants/theme";

export default function VendorsLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.primary }, headerTintColor: "#fff" }}>
      <Stack.Screen name="index" options={{ title: "Vendor market" }} />
      <Stack.Screen name="[id]" options={{ title: "Vendor visit" }} />
    </Stack>
  );
}
