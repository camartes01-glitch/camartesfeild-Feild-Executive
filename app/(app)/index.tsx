import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View, Alert } from "react-native";
import { Href, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Button, Card, Muted, Title } from "@/components/ui";
import { KindBadge, StatusBadge } from "@/components/task-badges";
import { MiniMap } from "@/components/mini-map";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { formatKm, haversineKm, pathKm } from "@/lib/geo";
import { formatDuration, localYmd, monthStats, shiftMinutes } from "@/lib/hours";
import { LOCATION_PRESETS, TEAM } from "@/lib/seed";
import { t } from "@/lib/i18n";
import { format, parseISO } from "date-fns";

export default function HomeScreen() {
  const {
    user,
    state,
    live,
    online,
    locationMode,
    setLocationMode,
    clockIn,
    clockOut,
    openShift,
    triggerSos,
    markNoticesRead,
    gpsMessage,
    refreshGps,
    cityManager,
  } = useApp();
  const lang = state.language;
  const openTasks = state.tasks.filter((t) => t.status !== "completed");
  const next = openTasks[0];
  const stats = monthStats(state.shifts);
  const you = live ?? { lat: 17.4126, lng: 78.4483 };
  const today = localYmd();
  const todayKm = pathKm(state.pings.filter((p) => format(parseISO(p.at), "yyyy-MM-dd") === today));
  const unread = state.notices.filter((n) => !n.read).length;
  const [override, setOverride] = useState("");
  const [geoError, setGeoError] = useState(false);

  async function doClockIn() {
    let selfieUri: string | undefined;
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Camera", t(lang, "selfieNeeded"));
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, quality: 0.4 });
      if (shot.canceled || !shot.assets[0]) return;
      selfieUri = shot.assets[0].uri;
    }
    const err = clockIn({ selfieUri: selfieUri ?? (Platform.OS === "web" ? "web-selfie" : undefined), overrideReason: override });
    if (err === "geofence") {
      setGeoError(true);
      Alert.alert("Outside hub geofence", t(lang, "geofenceFail"));
    } else {
      setGeoError(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      {!online ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t(lang, "offline")}</Text>
        </View>
      ) : null}
      <Muted>{t(lang, "hyderabadHub")}</Muted>
      <Title>
        {t(lang, "hello")}, {user?.name.split(" ")[0]}
      </Title>
      <Text style={styles.emp}>
        {user?.employeeId} · {user?.employment}
      </Text>

      <View style={styles.row}>
        <Button
          flex={1}
          label={`SOS · ${cityManager.manager.city}`}
          variant="danger"
          onPress={triggerSos}
        />
        <Button
          flex={1}
          label={`${t(lang, "notifications")}${unread ? ` (${unread})` : ""}`}
          variant="outline"
          onPress={markNoticesRead}
        />
      </View>

      {state.notices.filter((n) => !n.read).slice(0, 2).map((n) => (
        <Card key={n.id}>
          <Text style={styles.h}>{n.title}</Text>
          <Muted>{n.body}</Muted>
        </Card>
      ))}

      <Card>
        <Text style={styles.h}>{t(lang, "liveLocation")}</Text>
        <Muted>{t(lang, "trackingOnShift")}</Muted>
        <Muted>
          City manager: {cityManager.manager.name} · {cityManager.manager.city} · {cityManager.manager.phone}
        </Muted>
        <MiniMap
          markers={[
            { id: "you", label: "You", color: colors.primary, point: you },
            ...TEAM.filter((m) => m.id !== user?.id).map((m) => ({
              id: m.id,
              label: m.name.split(" ")[0],
              color: colors.orange,
              point: m.geo,
            })),
          ]}
        />
        <Muted>
          {live
            ? `${live.source === "gps" ? "Device GPS" : "Simulated"} · ${live.lat.toFixed(5)}, ${live.lng.toFixed(5)} · ±${Math.round(live.accuracyM)} m · ${new Date(live.at).toLocaleTimeString()}`
            : gpsMessage ?? "Waiting for a location fix…"}
        </Muted>
        {gpsMessage ? <Muted>{gpsMessage}</Muted> : null}
        <Button label="Use device GPS" variant={locationMode === "gps" ? "primary" : "outline"} onPress={refreshGps} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {LOCATION_PRESETS.map((p) => {
            const id = p.id === "live" ? "gps" : p.id;
            return (
              <Button
                key={p.id}
                label={p.label}
                variant={locationMode === id ? "primary" : "outline"}
                onPress={() => setLocationMode(id)}
              />
            );
          })}
        </ScrollView>
      </Card>

      <Card>
        <Text style={styles.h}>{openShift ? t(lang, "onShift") : t(lang, "offShift")}</Text>
        <Text style={styles.body}>
          {openShift ? formatDuration(shiftMinutes(openShift)) : `${stats.days} days · ${formatDuration(stats.minutes)}`}
        </Text>
        {geoError ? <Muted>{t(lang, "geofenceFail")}</Muted> : <Muted>{t(lang, "selfieNeeded")}</Muted>}
        {!openShift ? (
          <TextInput
            placeholder="Override reason if you are not at a hub"
            value={override}
            onChangeText={setOverride}
            style={styles.input}
          />
        ) : null}
        {openShift ? (
          <Button label={t(lang, "clockOut")} variant="outline" onPress={clockOut} />
        ) : (
          <Button label={t(lang, "clockIn")} onPress={() => void doClockIn()} />
        )}
      </Card>

      <View style={styles.stats}>
        <Stat label="Open" value={String(openTasks.length)} />
        <Stat label="Km" value={formatKm(todayKm)} />
        <Stat label="Team" value={String(TEAM.length)} />
      </View>

      <Card>
        <Text style={styles.h}>{t(lang, "route")}</Text>
        {openTasks.map((task, i) => (
          <Muted key={task.id}>
            {i + 1}. {task.customerPlace.area} · {task.bookingRef}
          </Muted>
        ))}
        <Button label={t(lang, "hubTeam")} variant="ghost" onPress={() => router.push("/hub" as Href)} />
        <Button label={t(lang, "vendors")} variant="ghost" onPress={() => router.push("/(app)/vendors")} />
      </Card>

      {next ? (
        <Card>
          <Text style={styles.h}>{t(lang, "nextStop")}</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            <KindBadge kind={next.kind} />
            <StatusBadge status={next.status} />
          </View>
          <Text style={styles.body}>{next.title}</Text>
          <Muted>
            Store → customer {formatKm(haversineKm(next.store.geo, next.customerPlace.geo))}
          </Muted>
          <Button label={t(lang, "openTask")} onPress={() => router.push(`/(app)/tasks/${next.id}`)} />
        </Card>
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Muted>{label}</Muted>
      <Text style={styles.body}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, backgroundColor: colors.bg, paddingBottom: 48 },
  h: { fontSize: 16, fontWeight: "800", color: colors.ink },
  body: { fontSize: 15, fontWeight: "700", color: colors.ink },
  emp: { color: colors.primaryDark, fontWeight: "700" },
  row: { flexDirection: "row", gap: 8 },
  stats: { flexDirection: "row", gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.peachBorder,
  },
  banner: { backgroundColor: colors.ink, borderRadius: 12, padding: 10 },
  bannerText: { color: colors.white, fontWeight: "700", fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.peachBorder,
    borderRadius: 10,
    padding: 10,
    backgroundColor: colors.cream,
  },
});
