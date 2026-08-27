import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Href, router } from "expo-router";
import { Button, Card, Muted, Title } from "@/components/ui";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी" },
  { id: "te", label: "తెలుగు" },
];

export default function MoreScreen() {
  const { user, state, logout, resetDemo, setLanguage, triggerSos, cityManager } = useApp();
  const lang = state.language;

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Title>{t(lang, "more")}</Title>
      <Card>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.av}>{user?.avatarInitials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Muted>
              {user?.role} · {user?.employeeId}
            </Muted>
            <Text style={styles.emp}>{user?.employment}</Text>
          </View>
        </View>
        <Muted>{user?.email}</Muted>
        <Muted>
          {t(lang, "deviceBound")} {state.deviceBoundId ?? "pending"}
        </Muted>
      </Card>
      <Card>
        <Text style={styles.h}>{t(lang, "language")}</Text>
        <View style={styles.chips}>
          {LANGS.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => setLanguage(l.id)}
              style={[styles.chip, lang === l.id && styles.chipOn]}
            >
              <Text style={[styles.chipTxt, lang === l.id && styles.chipTxtOn]}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
      <Button label={t(lang, "leave")} variant="outline" onPress={() => router.push("/(app)/leave")} />
      <Button label={t(lang, "hubTeam")} variant="outline" onPress={() => router.push("/hub" as Href)} />
      <Button label={t(lang, "expenses")} variant="outline" onPress={() => router.push("/expenses" as Href)} />
      <Button label={t(lang, "training")} variant="outline" onPress={() => router.push("/training" as Href)} />
      <Button label={`SOS · ${cityManager.manager.city}`} variant="danger" onPress={triggerSos} />
      <Card>
        <Text style={styles.h}>{t(lang, "audit")}</Text>
        {state.audit.slice(0, 12).map((a) => (
          <Muted key={a.id}>
            {new Date(a.at).toLocaleString()} · {a.label}
          </Muted>
        ))}
      </Card>
      <Card>
        <Text style={styles.h}>Offline queue</Text>
        {state.offlineQueue.length === 0 ? <Muted>Nothing waiting to sync.</Muted> : null}
        {state.offlineQueue.slice(0, 8).map((q) => (
          <Muted key={q.id}>
            {q.synced ? "Synced" : q.retries ? `Retry ${q.retries}` : "Queued"} · {q.label}
          </Muted>
        ))}
      </Card>
      <Button label={t(lang, "resetDemo")} variant="ghost" onPress={resetDemo} />
      <Button
        label={t(lang, "signOut")}
        variant="ghost"
        onPress={() =>
          Alert.alert("Sign out", "End this Camartes session?", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: logout },
          ])
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10, backgroundColor: colors.bg, paddingBottom: 48 },
  hero: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  av: { color: "#fff", fontWeight: "800", fontSize: 18 },
  name: { fontSize: 20, fontWeight: "800", color: colors.ink },
  emp: { marginTop: 4, fontWeight: "800", color: colors.primaryDark },
  h: { fontSize: 16, fontWeight: "800", color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.peach,
  },
  chipOn: { backgroundColor: colors.primary },
  chipTxt: { fontWeight: "700", color: colors.ink },
  chipTxtOn: { color: "#fff" },
});
