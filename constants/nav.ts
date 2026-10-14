import { colors } from "@/constants/theme";

/** Compact, calm headers shared by every stack/tab: cream bar, navy title, orange back arrow. */
export const headerOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerShadowVisible: false,
  headerTintColor: colors.primaryDark,
  headerTitleStyle: { fontWeight: "800" as const, color: colors.ink, fontSize: 18 },
  headerTitleAlign: "left" as const,
};
