import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Alert } from "react-native";
import { Href, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { format, parseISO } from "date-fns";
import { Button, Card, Muted, Title } from "@/components/ui";
import { CheckRow, Chip, ChipWrap } from "@/components/chips";
import { KindBadge, SlaBadge, StatusBadge } from "@/components/task-badges";
import { MiniMap } from "@/components/mini-map";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { formatKm, pathKm } from "@/lib/geo";
import { formatDuration, formatWhen, monthStats, shiftMinutes } from "@/lib/hours";
import { LOCATION_PRESETS, ROSTER } from "@/lib/seed";
import { t } from "@/lib/i18n";
import {
  SHIFT_START_KM,
  addYmd,
  evaluateShiftClockIn,
  istYmd,
} from "@/lib/field-ops";
import type { FieldTask } from "@/lib/types";

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
    myShifts,
    team,
  } = useApp();
  const lang = state.language;
  const today = istYmd();
  const tomorrow = addYmd(today, 1);
  const openAll = [...state.tasks]
    .filter((t) => t.status !== "completed" && t.assigneeId === user?.id)
    .sort((a, b) => (a.beatSeq ?? 99) - (b.beatSeq ?? 99) || a.scheduledFor.localeCompare(b.scheduledFor));
  const todayStops = openAll.filter((t) => t.scheduledFor.slice(0, 10) === today);
  const beat = todayStops.length ? todayStops : openAll.filter((t) => t.scheduledFor.slice(0, 10) !== tomorrow);
  const tomorrowTasks = openAll.filter((t) => t.scheduledFor.slice(0, 10) === tomorrow);
  const next = beat[0];
  const tomorrowRoster = ROSTER.find((r) => r.date === tomorrow);
  const stats = monthStats(myShifts);
  const you = live ?? { lat: 17.4126, lng: 78.4483 };
  const todayKm = pathKm(state.pings.filter((p) => p.userId === user?.id && format(parseISO(p.at), "yyyy-MM-dd") === today));
  const [helmet, setHelmet] = useState(false);
  const [twoWheeler, setTwoWheeler] = useState(false);
  const unread = state.notices.filter((n) => !n.read).length;
  const [override, setOverride] = useState("");
  const [geoError, setGeoError] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const gate = evaluateShiftClockIn({
    geo: live,
    tasks: state.tasks.filter((task) => task.assigneeId === user?.id),
    roster: ROSTER,
  });

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
    const err = clockIn({
      selfieUri: selfieUri ?? (Platform.OS === "web" ? "web-selfie" : undefined),
      overrideReason: override,
      safetyHelmet: helmet,
      safetyTwoWheeler: twoWheeler,
    });
    if (err === "safety") {
      Alert.alert("Safety checklist", "Confirm helmet and two-wheeler before punch-in.");
      return;
    }
    if (err === "geofence") {
      setGeoError(true);
      Alert.alert("Cannot clock in", t(lang, "geofenceFail"));
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

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Muted>{t(lang, "hyderabadHub")}</Muted>
          <Title>
            {t(lang, "hello")}, {user?.name.split(" ")[0]}
          </Title>
          <Text style={styles.emp}>
            {user?.employeeId} · {openShift ? "On shift" : "Off shift"}
          </Text>
        </View>
        <Pressable onPress={triggerSos} style={styles.sos}>
          <Text style={styles.sosTxt}>SOS</Text>
        </Pressable>
      </View>

      <View style={styles.stats}>
        <Stat label="Stops" value={String(beat.length)} />
        <Stat label="Km" value={formatKm(todayKm)} />
        <Stat label="Month" value={formatDuration(stats.minutes)} />
      </View>

      <Card>
        <Text style={styles.h}>{openShift ? t(lang, "onShift") : "Punch in"}</Text>
        <Text style={styles.body}>
          {openShift
            ? formatDuration(shiftMinutes(openShift))
            : "Selfie · 5 km of first stop or roster login · safety"}
        </Text>
        {geoError ? <Muted>{t(lang, "geofenceFail")}</Muted> : null}
        {!openShift ? (
          <>
            {!openShift && gate.firstTask ? (
              <Muted>
                First stop {gate.firstTask.id}
                {gate.kmToFirst != null ? ` · ${formatKm(gate.kmToFirst)} away` : " · pick a pin or GPS"}
                {gate.rosterWindow ? ` · roster ${gate.rosterWindow}` : ""}
                {gate.geoOk || gate.rosterOk ? " · ready" : ` · need ≤ ${SHIFT_START_KM} km or login window`}
              </Muted>
            ) : null}
            <CheckRow label="Helmet on" checked={helmet} onToggle={() => setHelmet((v) => !v)} />
            <CheckRow
              label="Two-wheeler / vehicle check"
              checked={twoWheeler}
              onToggle={() => setTwoWheeler((v) => !v)}
              hint="Lights, brakes, bag straps"
            />
            <TextInput
              nativeID="clock-in-override"
              accessibilityLabel="Clock-in override reason"
              placeholder="Override if you are far from first stop and outside login hours"
              value={override}
              onChangeText={setOverride}
              style={styles.input}
            />
            <Button label={t(lang, "clockIn")} onPress={() => void doClockIn()} />
          </>
        ) : (
          <Button label={t(lang, "clockOut")} variant="outline" onPress={clockOut} />
        )}
      </Card>

      <Card accent={false}>
        <View style={styles.beatHead}>
          <Text style={styles.h}>Beat · today</Text>
          <Button label="Hub map" variant="ghost" compact onPress={() => router.push("/hub" as Href)} />
        </View>
        {beat.length === 0 ? <Muted>No open stops.</Muted> : null}
        {beat.map((task, i) => (
          <BeatStop key={task.id} task={task} index={i} next={i === 0} />
        ))}
      </Card>

      <Card accent={false}>
        <Text style={styles.h}>Tomorrow</Text>
        {tomorrowRoster ? (
          <Muted>
            {tomorrowRoster.window} · {tomorrowRoster.hub}
          </Muted>
        ) : null}
        {tomorrowTasks.length === 0 ? <Muted>No jobs assigned yet.</Muted> : null}
        {tomorrowTasks.map((task) => (
          <Muted key={task.id}>
            {task.beatSeq ?? "–"}. {task.beatWindow} · {task.customerPlace.area}
          </Muted>
        ))}
      </Card>

      <Card>
        <View style={styles.beatHead}>
          <Text style={styles.h}>{t(lang, "liveLocation")}</Text>
          <Button label={showMap ? "Hide map" : "Show map"} variant="ghost" compact onPress={() => setShowMap((v) => !v)} />
        </View>
        <Muted>
          {live
            ? `${live.source === "gps" ? "GPS" : "Pin"} · ±${Math.round(live.accuracyM)} m`
            : gpsMessage ?? "Waiting for a location fix…"}
        </Muted>
        {showMap ? (
          <MiniMap
            height={140}
            markers={[
              { id: "you", label: "You", color: colors.primary, point: you },
              ...team
                .filter((m) => m.id !== user?.id && m.presence !== "directory")
                .map((m) => ({
                  id: m.id,
                  label: m.name.split(" ")[0],
                  color: colors.orange,
                  point: m.geo,
                })),
            ]}
          />
        ) : null}
        <ChipWrap>
          <Chip label="Device GPS" selected={locationMode === "gps"} onPress={refreshGps} />
          {LOCATION_PRESETS.filter((p) => p.id !== "live").map((p) => (
            <Chip key={p.id} label={p.label.replace(" Hills hub", "").replace(" City hub", "")} selected={locationMode === p.id} onPress={() => setLocationMode(p.id)} />
          ))}
        </ChipWrap>
      </Card>

      {unread ? (
        <Card>
          <View style={styles.beatHead}>
            <Text style={styles.h}>Alerts ({unread})</Text>
            <Button label="Mark read" variant="ghost" compact onPress={markNoticesRead} />
          </View>
          {state.notices
            .filter((n) => !n.read)
            .slice(0, 2)
            .map((n) => (
              <Muted key={n.id}>
                {n.title} — {n.body}
              </Muted>
            ))}
        </Card>
      ) : null}

      {next ? (
        <Muted>
          Next: {next.customerPlace.area}
          {next.beatWindow ? ` · ${next.beatWindow}` : ""}
        </Muted>
      ) : null}
    </ScrollView>
  );
}

function BeatStop({ task, index, next }: { task: FieldTask; index: number; next: boolean }) {
  return (
    <Pressable onPress={() => router.push(`/(app)/tasks/${task.id}`)} style={[styles.stop, next && styles.stopNext]}>
      <View style={[styles.num, next && styles.numNext]}>
        <Text style={styles.numTxt}>{task.beatSeq ?? index + 1}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.stopTitle} numberOfLines={1}>
          {task.customerPlace.area}
          {next ? " · next" : ""}
        </Text>
        <Muted>
          {task.beatWindow ?? formatWhen(task.scheduledFor)} · {task.bookingRef}
        </Muted>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          <KindBadge kind={task.kind} />
          <StatusBadge status={task.status} />
          <SlaBadge task={task} />
        </View>
      </View>
    </Pressable>
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
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  h: { fontSize: 16, fontWeight: "800", color: colors.ink },
  body: { fontSize: 15, fontWeight: "700", color: colors.ink },
  emp: { color: colors.primaryDark, fontWeight: "700" },
  sos: {
    backgroundColor: "#FEE2E2",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
  },
  sosTxt: { color: colors.danger, fontWeight: "800" },
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
  beatHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stop: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.peachBorder,
  },
  stopNext: { backgroundColor: colors.cream, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 12, borderTopWidth: 0 },
  num: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    opacity: 0.55,
  },
  numNext: { backgroundColor: colors.primary, opacity: 1 },
  numTxt: { fontWeight: "800", color: "#fff", fontSize: 12 },
  stopTitle: { fontWeight: "800", color: colors.ink, fontSize: 15 },
});
