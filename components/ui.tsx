import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, radius } from "@/constants/theme";

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
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
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "ghost" | "danger";
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.btn,
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
          (variant === "outline" || variant === "ghost") && { color: colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function Badge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "peach" | "green" | "blue" | "violet";
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
            : colors.white;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.peachBorder,
    borderWidth: 1,
    borderRadius: radius,
    padding: 14,
    gap: 8,
  },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  muted: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.peachBorder,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnOutline: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.peachBorder },
  btnGhost: { backgroundColor: "transparent" },
  btnDanger: { backgroundColor: "#FEE2E2" },
  btnText: { fontSize: 15, fontWeight: "600" },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
});
