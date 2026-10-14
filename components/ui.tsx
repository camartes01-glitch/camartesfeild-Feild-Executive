import { useId, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import { colors, elevation, radii, space, touch, type } from "@/constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLayout } from "@/lib/responsive";
import Svg, { Circle, Path } from "react-native-svg";

/* ───────────────────────────── Layout ───────────────────────────── */

/**
 * Screen shell: cream canvas, centred max-width column, breakpoint padding, room for the bottom tab bar and
 * (optionally) a sticky footer action.
 */
export function Screen({
  children,
  refreshControl,
  footer,
  bottomInset = 96,
  safeTop = false,
  maxWidth,
}: {
  children: ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  footer?: ReactNode;
  bottomInset?: number;
  /** Screens without a native header pad for the status bar / notch themselves. */
  safeTop?: boolean;
  /** Narrower reading width for list pages (alerts). */
  maxWidth?: number;
}) {
  const l = useLayout();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: l.pad, paddingTop: (safeTop ? insets.top : 0) + (l.isPhone ? space.lg : space.xl), paddingBottom: footer ? 140 : l.sideNav ? space.xxl : bottomInset }}
      >
        <View style={{ width: "100%", maxWidth: maxWidth ? Math.min(maxWidth, l.maxWidth) : l.maxWidth, alignSelf: "center", gap: space.md }}>{children}</View>
      </ScrollView>
      {footer ? <StickyFooter>{footer}</StickyFooter> : null}
    </View>
  );
}

/** Sticky bottom action bar (mobile), aligned to the content column on wider screens. */
export function StickyFooter({ children }: { children: ReactNode }) {
  const l = useLayout();
  return (
    <View style={styles.footer}>
      <View style={{ width: "100%", maxWidth: l.isPhone ? undefined : 720, alignSelf: "center", gap: space.sm }}>{children}</View>
    </View>
  );
}

/** Two columns on wide screens (main + side panel), stacked on phones. */
export function Columns({ main, side, sideWidth = 360 }: { main: ReactNode; side: ReactNode; sideWidth?: number }) {
  const l = useLayout();
  if (!l.twoCol) {
    return (
      <View style={{ gap: space.md }}>
        {main}
        {side}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", gap: space.lg, alignItems: "flex-start" }}>
      <View style={{ flex: 1, minWidth: 0, gap: space.md }}>{main}</View>
      {/* Narrower side column until there is room for both, so the main column keeps a readable width. */}
      <View style={{ width: l.contentWidth >= 1100 ? sideWidth : Math.min(sideWidth, 300), gap: space.md }}>{side}</View>
    </View>
  );
}

/** Responsive grid: 1 column on phones, `cols` on wider screens. */
export function Grid({ children, cols = 2, minItem = 280 }: { children: ReactNode; cols?: number; minItem?: number }) {
  const l = useLayout();
  const n = l.isPhone ? 1 : Math.max(1, Math.min(cols, Math.floor((Math.min(l.width, l.maxWidth) - l.pad * 2) / minItem)));
  if (n === 1) return <View style={{ gap: space.md }}>{children}</View>;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
      {(Array.isArray(children) ? children : [children]).flat().map((c, i) => (
        <View key={i} style={{ width: `${100 / n}%`, flexGrow: 0, flexShrink: 1, flexBasis: `${(100 - n * 2) / n}%` }}>
          {c}
        </View>
      ))}
    </View>
  );
}

/* ───────────────────────────── Typography ───────────────────────────── */

export function Title({ children }: { children: ReactNode }) {
  return <Text style={[type.display]}>{children}</Text>;
}

export function Muted({ children, numberOfLines }: { children: ReactNode; numberOfLines?: number }) {
  return (
    <Text style={type.meta} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function PageHeader({ title, subtitle, right, kicker, large }: { title: string; subtitle?: string; right?: ReactNode; kicker?: string; large?: boolean }) {
  return (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1, gap: 2 }}>
        {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
        <Text style={[type.title, large && { fontSize: 42, lineHeight: 48, letterSpacing: -1.2 }]} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={[type.meta, large && { fontSize: 17, lineHeight: 24 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionHeader({ title, icon: Icon, action, count }: { title: string; icon?: LucideIcon; action?: ReactNode; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1 }}>
        {Icon ? <Icon size={18} color={colors.primaryDark} /> : null}
        <Text style={type.heading} accessibilityRole="header">
          {title}
        </Text>
        {count != null ? <Text style={styles.count}>{count}</Text> : null}
      </View>
      {action}
    </View>
  );
}

/* ───────────────────────────── Surfaces ───────────────────────────── */

/**
 * Card. `accent` (kept for existing screens) adds the orange edge; `elevated` lifts the one card that matters most;
 * `tone` tints status cards. Not every card floats.
 */
export function Card({
  children,
  accent = false,
  elevated = false,
  tone,
  padding = space.lg,
  style,
}: {
  children: ReactNode;
  accent?: boolean;
  elevated?: boolean;
  tone?: "default" | "muted" | "success" | "warning" | "danger" | "brand";
  padding?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    tone === "muted" ? colors.surfaceMuted : tone === "success" ? colors.successBg : tone === "warning" ? colors.warningBg : tone === "danger" ? colors.dangerBg : tone === "brand" ? colors.primarySoft : colors.card;
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: bg, padding },
        elevated ? [styles.cardElevated, elevation[2]] : elevation[1],
        accent && styles.cardAccent,
        tone && tone !== "default" && { borderColor: "transparent" },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ───────────────────────────── Buttons ───────────────────────────── */

type Variant = "primary" | "outline" | "ghost" | "danger" | "secondary" | "plain";

/**
 * Button. Variants: primary (elevated orange), secondary/outline (white with quiet border), ghost (soft peach),
 * danger, plain (text). 44 px minimum touch target; `loading` shows a spinner and blocks taps.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  flex,
  compact,
  icon: Icon,
  loading,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  flex?: number;
  compact?: boolean;
  icon?: LucideIcon;
  loading?: boolean;
  accessibilityHint?: string;
}) {
  const v = variant === "outline" ? "secondary" : variant;
  const fg =
    v === "primary" ? colors.white : v === "danger" ? colors.dangerInk : v === "plain" ? colors.primaryDark : v === "ghost" ? colors.primaryDark : colors.ink;
  const off = !!disabled || !!loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: !!loading }}
      onPress={onPress}
      disabled={off}
      style={(state) => [
        styles.btn,
        compact && styles.btnCompact,
        flex != null ? { flex } : null,
        v === "primary" && [styles.btnPrimary, !off && elevation[1]],
        v === "secondary" && styles.btnSecondary,
        v === "ghost" && styles.btnGhost,
        v === "danger" && styles.btnDanger,
        v === "plain" && styles.btnPlain,
        off && styles.btnDisabled,
        state.pressed && !off && styles.pressed,
        (state as { focused?: boolean }).focused && styles.focusRing,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : Icon ? <Icon size={compact ? 16 : 18} color={fg} /> : null}
      <Text style={[styles.btnText, compact && styles.btnTextCompact, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Icon-only button with an accessible label (44 px). */
export function IconButton({
  icon: Icon,
  label,
  onPress,
  tone = "default",
  size = touch,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  tone?: "default" | "brand" | "danger";
  size?: number;
}) {
  const bg = tone === "brand" ? colors.primarySoft : tone === "danger" ? colors.dangerBg : colors.white;
  const fg = tone === "brand" ? colors.primaryDark : tone === "danger" ? colors.dangerInk : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={(s) => [styles.iconBtn, { width: size, height: size, backgroundColor: bg }, tone === "default" && styles.iconBtnBorder, s.pressed && styles.pressed]}
    >
      <Icon size={20} color={fg} />
    </Pressable>
  );
}

/* ───────────────────────────── Status ───────────────────────────── */

export type Tone = "default" | "peach" | "green" | "blue" | "violet" | "red" | "amber" | "slate";

const TONES: Record<Tone, { bg: string; fg: string; dot: string }> = {
  default: { bg: colors.primary, fg: colors.white, dot: colors.white },
  peach: { bg: colors.primarySoft, fg: colors.primaryDark, dot: colors.primary },
  green: { bg: colors.successBg, fg: colors.successInk, dot: colors.success },
  blue: { bg: colors.infoBg, fg: colors.infoInk, dot: colors.info },
  violet: { bg: colors.violetBg, fg: colors.violet, dot: colors.violet },
  red: { bg: colors.dangerBg, fg: colors.dangerInk, dot: colors.danger },
  amber: { bg: colors.warningBg, fg: colors.warningInk, dot: colors.warning },
  slate: { bg: "#F1F5F9", fg: "#475569", dot: "#94A3B8" },
};

/** Compact status chip. `dot` adds a leading status dot (state is never colour-only: the label carries it). */
export function Badge({ label, tone = "default", dot, icon: Icon }: { label: string; tone?: Tone; dot?: boolean; icon?: LucideIcon }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {Icon ? <Icon size={12} color={t.fg} /> : dot ? <View style={[styles.dot, { backgroundColor: t.dot }]} /> : null}
      <Text style={[styles.badgeText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function IconCircle({ icon: Icon, tone = "peach", size = 40 }: { icon: LucideIcon; tone?: Tone; size?: number }) {
  const t = TONES[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}>
      <Icon size={Math.round(size * 0.5)} color={t.fg} />
    </View>
  );
}

/** Compact metric tile: icon, big tabular number, label. */
export function MetricTile({ icon: Icon, label, value, tone = "slate", hint }: { icon: LucideIcon; label: string; value: string | number; tone?: Tone; hint?: string }) {
  const t = TONES[tone];
  return (
    <View style={[styles.metric, elevation[1]]} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={[styles.metricIcon, { backgroundColor: t.bg }]}>
          <Icon size={16} color={t.fg} />
        </View>
      </View>
      <Text style={[type.metric, { fontSize: 28 }]}>{value}</Text>
      <Text style={type.caption} numberOfLines={1}>
        {label}
      </Text>
      {hint ? <Text style={[type.caption, { color: t.fg }]}>{hint}</Text> : null}
    </View>
  );
}

export function ProgressBar({ value, tone = "peach", height = 8 }: { value: number; tone?: Tone; height?: number }) {
  const t = TONES[tone];
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: "#F3EDE6", overflow: "hidden" }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <View style={{ width: `${pct * 100}%`, height, borderRadius: height, backgroundColor: tone === "default" ? colors.primary : t.dot }} />
    </View>
  );
}

/* ───────────────────────────── Controls ───────────────────────────── */

/** Modern segmented control (Open / Closed, Today / Tomorrow). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accent,
  solid,
  outline,
}: {
  options: { id: T; label: string; count?: number; icon?: LucideIcon }[];
  value: T;
  onChange: (id: T) => void;
  /** Opt-in brand treatment: orange active label with an underline accent (Jobs tabs). */
  accent?: boolean;
  /** Opt-in: active tab filled solid orange with white label (Roster day switch). */
  solid?: boolean;
  /** Opt-in: active option outlined in orange on white (language switch). */
  outline?: boolean;
}) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            style={(s) => [styles.segItem, on && [styles.segOn, elevation[1]], on && solid && styles.segSolid, on && outline && styles.segOutline, outline && { minHeight: 52 }, solid && { minHeight: 56 }, s.pressed && !on && { opacity: 0.7 }]}
          >
            {o.icon ? <o.icon size={20} color={on && solid ? colors.white : colors.muted} /> : null}
            <Text style={[styles.segText, on && styles.segTextOn, on && accent && { color: colors.primary, fontWeight: "800" }, solid && { fontSize: 18 }, on && solid && { color: colors.white, fontWeight: "800" }, on && outline && { color: colors.primary, fontWeight: "800", fontSize: 17 }]}>{o.label}</Text>
            {o.count != null ? (
              <View style={[styles.segCount, on && { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.segCountText, on && { color: colors.primaryDark }]}>{o.count}</Text>
              </View>
            ) : null}
            {on && accent ? <View style={styles.segUnderline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Settings / navigation row with icon and disclosure arrow. */
export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  tone = "slate",
  right,
  last,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  onPress?: () => void;
  tone?: Tone;
  right?: ReactNode;
  last?: boolean;
}) {
  const body = (
    <>
      <IconCircle icon={icon} tone={tone} size={36} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[type.body, { fontWeight: "600" }]}>{label}</Text>
        {value ? (
          <Text style={type.meta} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress ? <ChevronRight size={18} color={colors.faint} /> : null}
    </>
  );
  if (!onPress) return <View style={[styles.row, !last && styles.rowLine]}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={(s) => [styles.row, !last && styles.rowLine, s.pressed && { backgroundColor: colors.surfaceMuted }]}>
      {body}
    </Pressable>
  );
}

export function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2.4, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no">
      <Text style={{ color: colors.white, fontWeight: "800", fontSize: size * 0.38 }}>{initials || "C"}</Text>
    </View>
  );
}

/* ───────────────────────────── States ───────────────────────────── */

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      {/* Lightweight branded illustration: cream halo, orange orbit and a small route trail around the icon. */}
      <View style={styles.emptyArt}>
        <View style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={132} height={96} viewBox="0 0 132 96">
          <Circle cx={66} cy={48} r={44} fill={colors.bgWarm} />
          <Circle cx={66} cy={48} r={34} fill="none" stroke={colors.primary} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="4 5" />
          <Path d="M8 78 C 30 70, 36 88, 58 82" fill="none" stroke={colors.ink} strokeOpacity={0.18} strokeWidth={2} strokeLinecap="round" strokeDasharray="2 6" />
          <Circle cx={112} cy={22} r={5} fill={colors.primary} fillOpacity={0.85} />
          <Circle cx={18} cy={30} r={3} fill={colors.ink} fillOpacity={0.2} />
        </Svg>
        </View>
        <View style={[styles.emptyIcon, elevation[1]]}>
          <Icon size={26} color={colors.primary} />
        </View>
      </View>
      <Text style={[type.heading, { textAlign: "center" }]}>{title}</Text>
      {body ? <Text style={[type.meta, { textAlign: "center", maxWidth: 320 }]}>{body}</Text> : null}
      {action}
    </View>
  );
}

/** Soft cream placeholder block for loading states; shape it to the content it stands in for. */
export function Skeleton({ width = "100%", height = 14, radius, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: object }) {
  return <View style={[styles.skeleton, { width, height }, radius != null && { borderRadius: radius }, style]} />;
}

export function ErrorState({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Text style={[type.label, { color: colors.dangerInk, flex: 1 }]}>{message}</Text>
      {onRetry ? <Button compact variant="secondary" label={retryLabel ?? "Retry"} onPress={onRetry} /> : null}
    </View>
  );
}

/* ───────────────────────────── Forms ───────────────────────────── */

export function Field({
  label,
  nativeID,
  error,
  hint,
  required,
  ...props
}: TextInputProps & { label: string; error?: string | null; hint?: string; required?: boolean }) {
  const generatedId = useId();
  const inputId = nativeID ?? generatedId;
  const labelId = `${inputId}-label`;

  return (
    <View style={{ gap: 6 }}>
      <Text nativeID={labelId} style={type.label}>
        {label}
        {required ? <Text style={{ color: colors.primaryDark }}> *</Text> : null}
      </Text>
      <TextInput
        nativeID={inputId}
        accessibilityLabel={label}
        accessibilityLabelledBy={labelId}
        placeholderTextColor={colors.faint}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 88, textAlignVertical: "top" }, !!error && styles.inputError, props.style]}
      />
      {error ? <Text style={[type.caption, { color: colors.dangerInk }]}>{error}</Text> : hint ? <Text style={type.caption}>{hint}</Text> : null}
    </View>
  );
}

/** Group of related form fields with a numbered/iconed heading. */
export function FormSection({ step, title, done, children, icon: Icon }: { step?: number; title: string; done?: boolean; children: ReactNode; icon?: LucideIcon }) {
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 4 }}>
        <View style={[styles.stepDot, done && { backgroundColor: colors.success }]}>
          {Icon && !step ? <Icon size={14} color={colors.white} /> : <Text style={styles.stepDotText}>{done ? "✓" : step}</Text>}
        </View>
        <Text style={type.heading}>{title}</Text>
      </View>
      <View style={{ gap: space.md }}>{children}</View>
    </Card>
  );
}

export function BrandMark({ size = 52 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size / 3.2 }, elevation[2]]}>
      <Text style={[styles.markC, { fontSize: size * 0.46 }]}>C</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeader: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.xs, paddingTop: space.xs },
  kicker: { fontSize: 13, fontWeight: "700", color: colors.primaryDark },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm },
  count: { fontSize: 13, fontWeight: "700", color: colors.muted, backgroundColor: "#F1F5F9", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, overflow: "hidden" },
  card: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.line, gap: space.sm },
  cardElevated: { borderColor: "transparent", borderRadius: radii.hero },
  cardAccent: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  btn: {
    minHeight: touch,
    borderRadius: radii.button,
    paddingHorizontal: space.lg,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: space.sm,
  },
  btnCompact: { minHeight: 44, paddingVertical: 9, paddingHorizontal: space.md, borderRadius: radii.sm },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.lineStrong },
  btnGhost: { backgroundColor: colors.primarySoft },
  btnDanger: { backgroundColor: colors.dangerBg },
  btnPlain: { backgroundColor: "transparent", paddingHorizontal: space.sm },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 15, fontWeight: "700", letterSpacing: -0.1 },
  btnTextCompact: { fontSize: 13 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  focusRing: { outlineWidth: 2, outlineColor: colors.primary, outlineStyle: "solid", outlineOffset: 2 } as object,
  iconBtn: { borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  iconBtnBorder: { borderWidth: 1, borderColor: colors.line },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", maxWidth: "100%" },
  badgeText: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  metric: { flexGrow: 1, flexBasis: 140, minWidth: 0, backgroundColor: colors.white, borderRadius: radii.md, padding: space.md, gap: 4, borderWidth: 1, borderColor: colors.line },
  metricIcon: { width: 28, height: 28, borderRadius: radii.xs, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", backgroundColor: "#F4ECE3", borderRadius: radii.md, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 40, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: space.md },
  segOn: { backgroundColor: colors.white },
  segSolid: { backgroundColor: colors.primary },
  segOutline: { borderWidth: 1.5, borderColor: colors.primary },
  segUnderline: { position: "absolute", left: "8%", right: "8%", bottom: 0, height: 3, borderRadius: 2, backgroundColor: colors.primary },
  segText: { fontSize: 15, fontWeight: "600", color: colors.muted },
  segTextOn: { color: colors.ink, fontWeight: "700" },
  segCount: { backgroundColor: "#EADFD3", borderRadius: radii.pill, paddingHorizontal: 7, paddingVertical: 1 },
  segCountText: { fontSize: 12, fontWeight: "800", color: colors.muted },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, minHeight: 56 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyArt: { width: 132, height: 96, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  skeleton: { backgroundColor: colors.bgWarm, borderRadius: radii.sm },
  error: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.dangerBg, borderRadius: radii.md, padding: space.md },
  input: {
    minHeight: touch,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    borderRadius: radii.button,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    color: colors.ink,
  },
  inputError: { borderColor: colors.danger, backgroundColor: "#FFFBFB" },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  stepDotText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  mark: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  markC: { color: "#fff", fontWeight: "900" },
});
