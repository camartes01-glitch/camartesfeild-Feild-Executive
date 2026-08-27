import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, Field, Muted, Title } from "@/components/ui";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";

export default function LoginScreen() {
  const { user, ready, login } = useApp();
  const [email, setEmail] = useState("rahul@camartes.com");
  const [password, setPassword] = useState("field2026");
  const [error, setError] = useState<string | null>(null);

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
        <View style={styles.logo}>
          <Text style={styles.logoText}>C</Text>
        </View>
        <Title>Camartes Field</Title>
        <Muted>
          React Native app for field executives: address checks, rental deliveries, returns and hub counts in Hyderabad.
        </Muted>
        <Card>
          <Field label="Work email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} />
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <Button label="Sign in" onPress={submit} />
          <Muted>Demo: rahul@camartes.com or priya@camartes.com · field2026</Muted>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    backgroundColor: colors.bg,
    padding: 20,
    paddingTop: 72,
    gap: 12,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: "#fff", fontWeight: "800", fontSize: 22 },
  err: { color: colors.danger, fontSize: 13 },
});
