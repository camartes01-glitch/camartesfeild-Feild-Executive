import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { BrandMark, Button, Card, Field, Muted, Title } from "@/components/ui";
import { Chip, ChipWrap } from "@/components/chips";
import { colors } from "@/constants/theme";
import { t } from "@/lib/i18n";
import { useApp } from "@/lib/app-context";

export default function LoginScreen() {
  const { user, ready, login, state } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("field2026");
  const [error, setError] = useState<string | null>(null);
  const lang = state.language;

  useEffect(() => {
    setEmail("rahul@camartes.com");
  }, []);

  useEffect(() => {
    if (ready && user) router.replace("/(app)");
  }, [ready, user]);

  function submit() {
    const msg = login(email, password);
    if (msg) setError(msg);
    else router.replace("/(app)");
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <BrandMark />
          <Text style={styles.kicker}>{t(lang, "employeeApp")}</Text>
          <Title>{t(lang, "fieldTitle")}</Title>
          <Muted>
            For Camartes employees only — Hyderabad hub field executives handling rentals, returns and verification.
          </Muted>
        </View>
        <Card>
          <Field
            label={t(lang, "workEmail")}
            nativeID="login-email"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            label={t(lang, "password")}
            nativeID="login-password"
            autoComplete="current-password"
            textContentType="password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
            returnKeyType="done"
          />
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <Button label={t(lang, "signIn")} onPress={submit} />
          <Muted>Tap a name to fill the demo login. Password is already set.</Muted>
          <ChipWrap>
            <Chip label="Rahul · 104" selected={email.startsWith("rahul")} onPress={() => setEmail("rahul@camartes.com")} />
            <Chip label="Priya · 109" selected={email.startsWith("priya")} onPress={() => setEmail("priya@camartes.com")} />
            <Chip label="Arjun · 112" selected={email.startsWith("arjun")} onPress={() => setEmail("arjun@camartes.com")} />
          </ChipWrap>
        </Card>
        <Pressable onPress={() => router.push("/admin")} style={styles.adminLink}>
          <View>
            <Text style={styles.adminTitle}>Operations manager?</Text>
            <Text style={styles.adminCopy}>Open the field operations console</Text>
          </View>
          <Text style={styles.adminArrow}>→</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, backgroundColor: colors.bg, padding: 22, paddingTop: 64, gap: 18 },
  hero: { gap: 8 },
  kicker: {
    color: colors.primaryDark,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  err: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  adminLink: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.peachBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  adminTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  adminCopy: { color: colors.muted, fontSize: 11, marginTop: 3 },
  adminArrow: { color: colors.primaryDark, fontSize: 20, fontWeight: "700" },
});
