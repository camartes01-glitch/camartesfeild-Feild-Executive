import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, radius } from "@/constants/theme";

export function Card({
  children,
  accent = true,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <View style={[styles.card, accent && styles.cardAccent]}>
      {children}
    </View>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  flex,
  compact,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "ghost" | "danger";
  disabled?: boolean;
  flex?: number;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.btn,
        compact && styles.btnCompact,
        flex != null ? { flex } : null,
        variant === "primary" && styles.btnPrimary,
        variant === "outline" && styles.btnOutline,
        variant === "ghost" && styles.btnGhost,
        variant === "danger" && styles.btnDanger,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text
        style={[
          styles.btnText,
          variant === "primary" && { color: colors.white },
          variant === "danger" && { color: colors.danger },
          (variant === "outline" || variant === "ghost") && { color: colors.primaryDark },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

export function Badge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "peach" | "green" | "blue" | "violet" | "red";
}) {
  const bg =
    tone === "peach"
      ? "#FFEDD5"
      : tone === "green"
        ? "#D1FAE5"
        : tone === "blue"
          ? "#DBEAFE"
          : tone === "violet"
            ? "#EDE9FE"
            : tone === "red"
              ? "#FEE2E2"
              : colors.primary;
  const fg =
    tone === "peach"
      ? "#EA580C"
      : tone === "green"
        ? "#059669"
        : tone === "blue"
          ? "#1D4ED8"
          : tone === "violet"
            ? "#7C3AED"
            : tone === "red"
              ? "#B91C1C"
              : colors.white;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

export function BrandMark() {
  return (
    <View style={styles.mark}>
      <Text style={styles.markC}>C</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.peachBorder,
    borderWidth: 1,
    borderRadius: radius,
    padding: 16,
    gap: 8,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardAccent: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink, letterSpacing: -0.4 },
  muted: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: "700", color: colors.ink },
  input: {
    borderWidth: 1,
    borderColor: colors.peachBorder,
    backgroundColor: colors.cream,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: colors.text,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnCompact: { paddingVertical: 8, paddingHorizontal: 10 },
  btnPrimary: { backgroundColor: colors.primary },
  btnOutline: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primary },
  btnGhost: { backgroundColor: colors.peach },
  btnDanger: { backgroundColor: "#FEE2E2" },
  btnText: { fontSize: 15, fontWeight: "700" },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  mark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  markC: { color: "#fff", fontWeight: "800", fontSize: 24 },
});
