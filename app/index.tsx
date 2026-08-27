import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { BrandMark, Button, Card, Field, Muted, Title } from "@/components/ui";
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
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Field label={t(lang, "password")} secureTextEntry value={password} onChangeText={setPassword} />
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <Button label={t(lang, "signIn")} onPress={submit} />
          <Muted>Demo staff: rahul, priya or arjun (camartes.com) · password field2026</Muted>
        </Card>
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
});
