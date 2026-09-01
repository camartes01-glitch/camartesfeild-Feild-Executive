import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { BrandMark, Button, Card, Field, Muted, Title } from "@/components/ui";
import { Chip, ChipWrap } from "@/components/chips";
import { colors } from "@/constants/theme";
import { t } from "@/lib/i18n";
import { useApp } from "@/lib/app-context";

function homeFor(role: string | undefined) {
  return role === "operations_manager" ? "/admin" : "/(app)";
}

export default function LoginScreen() {
  const { user, ready, login, state, isDemoMode } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lang = state.language;

  useEffect(() => {
    if (isDemoMode) setEmail("rahul@camartes.com");
  }, [isDemoMode]);

  useEffect(() => {
    if (ready && user) router.replace(homeFor(user.role));
  }, [ready, user]);

  async function submit() {
    setBusy(true);
    setError(null);
    const msg = await login(email, password);
    setBusy(false);
    if (msg) setError(msg);
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
        {isDemoMode ? (
          <View style={styles.demoBanner}>
            <Text style={styles.demoTitle}>Development demo mode</Text>
            <Text style={styles.demoCopy}>
              Demo accounts are available only while this build is in development. Production uses Camartes login and
              never stores passwords on the device.
            </Text>
          </View>
        ) : null}
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
            onSubmitEditing={() => void submit()}
            returnKeyType="done"
          />
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <Button label={busy ? "Signing in…" : t(lang, "signIn")} onPress={() => void submit()} disabled={busy} />
          {isDemoMode ? (
            <>
              <Muted>Demo only — tap a name, then enter the demo password used in development.</Muted>
              <ChipWrap>
                <Chip
                  label="Rahul · FE"
                  selected={email.startsWith("rahul")}
                  onPress={() => setEmail("rahul@camartes.com")}
                />
                <Chip
                  label="Priya · FE"
                  selected={email.startsWith("priya")}
                  onPress={() => setEmail("priya@camartes.com")}
                />
                <Chip
                  label="Arjun · FE"
                  selected={email.startsWith("arjun")}
                  onPress={() => setEmail("arjun@camartes.com")}
                />
                <Chip
                  label="Meera · Ops"
                  selected={email.startsWith("ops")}
                  onPress={() => setEmail("ops@camartes.com")}
                />
              </ChipWrap>
            </>
          ) : (
            <Muted>Sign in with your Camartes work account. Field executives and operations managers use the same form.</Muted>
          )}
        </Card>
        <Pressable
          onPress={() => {
            if (isDemoMode) setEmail("ops@camartes.com");
            else setError("Sign in with an operations manager account to open the console.");
          }}
          style={styles.adminLink}
        >
          <View>
            <Text style={styles.adminTitle}>Operations manager?</Text>
            <Text style={styles.adminCopy}>
              {isDemoMode ? "Fill the ops demo account, then sign in" : "Sign in with your operations account"}
            </Text>
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
  demoBanner: {
    backgroundColor: colors.peach,
    borderWidth: 1,
    borderColor: colors.peachBorder,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  demoTitle: { color: colors.primaryDark, fontWeight: "800", fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" },
  demoCopy: { color: colors.ink, fontSize: 12, lineHeight: 18 },
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
