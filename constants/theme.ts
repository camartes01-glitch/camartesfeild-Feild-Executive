import { Platform } from "react-native";

/**
 * Camartes design tokens. Orange is the brand accent (used strategically, not on every border), warm cream is
 * the canvas, white is the elevated surface, deep navy carries strong text.
 */
export const colors = {
  // Canvas & surfaces
  bg: "#FFF8EF",
  bgWarm: "#F8EBDD",
  card: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceMuted: "#FFFBF6",
  cream: "#FFF8F3",
  peach: "#FFEDD5",
  peachBorder: "#F1D6C0",
  // Neutral lines (most borders): quiet, so orange can mean something
  line: "#F6E6D8",
  lineStrong: "#F1D6C0",
  // Text
  ink: "#14213D",
  text: "#14213D",
  muted: "#64748B",
  faint: "#94A3B8",
  // Brand
  primary: "#FF6B35",
  primaryDark: "#E95725",
  primarySoft: "#FFF0E8",
  orange: "#FF6B00",
  // Status (used sparingly, always with an icon or label too)
  success: "#0FA968",
  successInk: "#047857",
  successBg: "#E7F8F0",
  warning: "#F59E0B",
  warningInk: "#B45309",
  warningBg: "#FFF5DC",
  danger: "#E53935",
  dangerInk: "#B91C1C",
  dangerBg: "#FDEAEA",
  info: "#3B82F6",
  infoInk: "#1D4ED8",
  infoBg: "#EAF2FF",
  violet: "#7C3AED",
  violetBg: "#F1EBFE",
  white: "#FFFFFF",
  shadow: "rgba(234, 88, 12, 0.12)",
};

/** Radii: small chips → medium cards → large panels → hero. Not everything gets the same radius. */
export const radii = { xs: 8, sm: 10, md: 14, lg: 18, hero: 24, pill: 999, button: 12 };
/** Kept for existing callers. */
export const radius = radii.md;

/** 4 px base: 4, 8, 12, 16, 20, 24, 32, 40, 48. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, lgx: 20, xl: 24, xxl: 32, xxxl: 40, huge: 48 };

export const type = {
  display: { fontSize: 30, fontWeight: "800" as const, letterSpacing: -0.8, color: colors.ink, lineHeight: 36 },
  title: { fontSize: 26, fontWeight: "800" as const, letterSpacing: -0.6, color: colors.ink, lineHeight: 32 },
  heading: { fontSize: 17, fontWeight: "800" as const, letterSpacing: -0.3, color: colors.ink },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.ink, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: "600" as const, color: colors.ink },
  meta: { fontSize: 13, fontWeight: "500" as const, color: colors.muted, lineHeight: 18 },
  caption: { fontSize: 13, fontWeight: "600" as const, color: colors.muted },
  metric: { fontSize: 30, fontWeight: "800" as const, letterSpacing: -0.8, color: colors.ink, fontVariant: ["tabular-nums" as const] },
};

/** Soft layered elevation. Level 2 only for the one thing that matters most on a screen; 3 for floating chrome. */
export const elevation = {
  0: {},
  1: Platform.select({
    web: { boxShadow: "0 2px 8px rgba(20,33,61,0.04), 0 6px 22px rgba(20,33,61,0.05)" },
    default: { shadowColor: "#14213D", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  }),
  2: Platform.select({
    web: { boxShadow: "0 2px 6px rgba(20,33,61,0.05), 0 12px 32px rgba(20,33,61,0.10)" },
    default: { shadowColor: "#14213D", shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  }),
  3: Platform.select({
    web: { boxShadow: "0 2px 6px rgba(20,33,61,0.05), 0 16px 40px rgba(20,33,61,0.12)" },
    default: { shadowColor: "#14213D", shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  }),
} as Record<0 | 1 | 2 | 3, object>;

/** Breakpoints (px): phone < 768 ≤ tablet < 1024 ≤ laptop < 1440 ≤ desktop. */
export const breakpoints = { tablet: 768, laptop: 1024, desktop: 1440 };
export const contentMax = { tablet: 1100, laptop: 1200, desktop: 1400 };
/** Left navigation width on laptop / desktop. */
export const sidebar = { laptop: 248, desktop: 268 };
export const touch = 44;
