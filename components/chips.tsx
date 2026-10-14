import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check, type LucideIcon } from "lucide-react-native";
import { colors, elevation, radii, space, touch, type } from "@/constants/theme";

/** Selectable pill (filters, small choices). Selected = filled; never colour-only (check icon too). */
export function Chip({
  label,
  selected,
  onPress,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  tone?: "default" | "danger" | "brand";
  icon?: LucideIcon;
}) {
  const danger = tone === "danger";
  const brand = tone === "brand";
  const fg = selected ? (danger ? colors.dangerInk : colors.white) : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={(s) => [
        styles.chip,
        brand && styles.chipBrand,
        selected && (danger ? styles.chipDanger : brand ? styles.chipBrandOn : styles.chipOn),
        s.pressed && { opacity: 0.8 },
      ]}
    >
      {selected ? <Check size={14} color={fg} /> : Icon ? <Icon size={14} color={colors.muted} /> : null}
      <Text style={[styles.chipTxt, brand && { fontSize: 13 }, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipWrap({ children }: { children: ReactNode }) {
  return <View style={styles.wrap}>{children}</View>;
}

/** Large selectable card with an icon (partner type, expense category). */
export function ChoiceCard({
  label,
  icon: Icon,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={(s) => [styles.choice, selected && [styles.choiceOn, elevation[1]], s.pressed && { transform: [{ scale: 0.98 }] }, disabled && !selected && { opacity: 0.5 }]}
    >
      <View style={[styles.choiceIcon, selected && { backgroundColor: colors.primary }]}>
        <Icon size={20} color={selected ? colors.white : colors.primaryDark} />
      </View>
      <Text style={[styles.choiceLabel, selected && { color: colors.ink }]} numberOfLines={2}>
        {label}
      </Text>
      {selected ? (
        <View style={styles.choiceTick}>
          <Check size={12} color={colors.white} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function CheckRow({
  label,
  checked,
  onToggle,
  hint,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  hint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={(s) => [styles.check, checked && styles.checkOn, s.pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Check size={14} color={colors.white} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.checkLabel}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Checklist row (done items are ticked and muted, not just recoloured). */
export function StepRow({ label, done, current }: { label: string; done: boolean; current?: boolean }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepDot, done && styles.stepDotOn, current && !done && styles.stepDotCurrent]}>
        {done ? <Check size={12} color={colors.white} /> : null}
      </View>
      <Text style={[styles.stepLabel, done && styles.stepDone, current && !done && styles.stepCurrent]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipBrand: { paddingHorizontal: 8, gap: 4, minHeight: 34, paddingVertical: 6 },
  chipBrandOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDanger: { backgroundColor: colors.dangerBg, borderColor: "#F9C9C9" },
  chipTxt: { fontWeight: "600", fontSize: 14 },
  choice: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 96,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: space.md,
    gap: space.sm,
  },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  choiceLabel: { fontSize: 14, fontWeight: "700", color: colors.ink, lineHeight: 18 },
  choiceTick: { position: "absolute", top: 10, right: 10, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  check: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: touch + 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: space.md,
    backgroundColor: colors.white,
  },
  checkOn: { backgroundColor: colors.successBg, borderColor: "#B9EBD5" },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.success, borderColor: colors.success },
  checkLabel: { ...type.body, fontWeight: "600" },
  hint: { ...type.caption, marginTop: 2 },
  step: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  stepDotOn: { backgroundColor: colors.success, borderColor: colors.success },
  stepDotCurrent: { borderColor: colors.primary, borderWidth: 2 },
  stepLabel: { fontSize: 14, color: colors.ink, flex: 1 },
  stepDone: { color: colors.muted },
  stepCurrent: { fontWeight: "700" },
});
