import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/constants/theme";

export function Chip({
  label,
  selected,
  onPress,
  tone = "default",
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        selected && styles.chipOn,
        tone === "danger" && selected && styles.chipDanger,
      ]}
    >
      <Text
        style={[
          styles.chipTxt,
          selected && styles.chipTxtOn,
          tone === "danger" && selected && styles.chipTxtDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipWrap({ children }: { children: ReactNode }) {
  return <View style={styles.wrap}>{children}</View>;
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
    <Pressable onPress={onToggle} style={[styles.check, checked && styles.checkOn]}>
      <View style={[styles.box, checked && styles.boxOn]}>
        <Text style={styles.tick}>{checked ? "✓" : ""}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.checkLabel, checked && styles.checkLabelOn]}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

export function StepRow({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepDot, done && styles.stepDotOn]}>
        <Text style={styles.stepTick}>{done ? "✓" : ""}</Text>
      </View>
      <Text style={[styles.stepLabel, done && styles.stepDone]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.peachBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDanger: { backgroundColor: "#FEE2E2", borderColor: "#FECACA" },
  chipTxt: { fontWeight: "700", fontSize: 12, color: colors.ink },
  chipTxtOn: { color: "#fff" },
  chipTxtDanger: { color: "#B91C1C" },
  check: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.peachBorder,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.cream,
  },
  checkOn: { backgroundColor: "#FFF7ED", borderColor: colors.primary },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.peachBorder,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: "#fff", fontWeight: "800", fontSize: 12 },
  checkLabel: { fontWeight: "700", color: colors.ink, fontSize: 14 },
  checkLabelOn: { color: colors.ink },
  hint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  step: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  stepDotOn: { backgroundColor: colors.success, borderColor: colors.success },
  stepTick: { color: "#fff", fontSize: 10, fontWeight: "800" },
  stepLabel: { fontSize: 13, color: colors.ink, flex: 1 },
  stepDone: { color: colors.muted, textDecorationLine: "line-through" },
});
