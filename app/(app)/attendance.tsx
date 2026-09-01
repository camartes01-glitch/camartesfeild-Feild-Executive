import { useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Button, Card, Field, Muted, Title } from "@/components/ui";
import { CheckRow, Chip, ChipWrap } from "@/components/chips";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { BANJARA, HITEC, LOCATION_PRESETS, ROSTER } from "@/lib/seed";
import { formatDuration, formatWhen, monthStats, shiftMinutes } from "@/lib/hours";
import { formatKm, haversineKm, nearestHubKm } from "@/lib/geo";
import { SHIFT_START_KM, activityMinutes, evaluateShiftClockIn, istYmd } from "@/lib/field-ops";
import { t } from "@/lib/i18n";

export default function AttendanceScreen() {
  const { state, live, clockIn, clockOut, requestOt, openShift, locationMode, setLocationMode, myShifts, user } = useApp();
  const lang = state.language;
  const [reason, setReason] = useState("");
  const [helmet, setHelmet] = useState(false);
  const [twoWheeler, setTwoWheeler] = useState(false);
  const stats = monthStats(myShifts);
  const otMinutes = stats.shifts.reduce((acc, s) => {
    const extra = Math.max(0, shiftMinutes(s) - 8 * 60);
    return acc + extra;
  }, 0);
  const hubKm = live ? nearestHubKm(live, [BANJARA.geo, HITEC.geo]) : null;
  const nearer = live
    ? haversineKm(live, BANJARA.geo) <= haversineKm(live, HITEC.geo)
      ? BANJARA.name
      : HITEC.name
    : null;
  const gate = evaluateShiftClockIn({
    geo: live,
    tasks: state.tasks.filter((task) => task.assigneeId === user?.id),
    roster: ROSTER,
    overrideReason: reason.trim() || undefined,
  });

  async function selfieThenClock() {
    let selfieUri: string | undefined;
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Camera", t(lang, "selfieNeeded"));
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({
        quality: 0.4,
        cameraType: ImagePicker.CameraType.front,
      });
      if (shot.canceled || !shot.assets[0]) return;
      selfieUri = shot.assets[0].uri;
    } else {
      selfieUri = "web-selfie";
    }
    const err = clockIn({
      selfieUri,
      overrideReason: reason.trim() || undefined,
      safetyHelmet: helmet,
      safetyTwoWheeler: twoWheeler,
    });
    if (err === "safety") {
      Alert.alert("Safety checklist", "Tick helmet and two-wheeler / vehicle check before punch-in.");
      return;
    }
    if (err === "geofence") {
      const first = gate.firstTask;
      const dist = gate.kmToFirst != null ? formatKm(gate.kmToFirst) : "unknown distance";
      Alert.alert(
        "Cannot clock in",
        first
          ? `You are ${dist} from first stop ${first.id} (${first.customerPlace.area}). Need within ${SHIFT_START_KM} km, or roster login hours${gate.rosterWindow ? ` (${gate.rosterWindow})` : ""}. Pick a nearer pin or enter an override reason.`
          : t(lang, "geofenceFail"),
      );
      return;
    }
    if (err) Alert.alert("Cannot clock in", err);
    else setReason("");
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Title>{t(lang, "hours")}</Title>
      <Muted>Selfie punch · 5 km of first assigned stop or roster login · trail only while clocked in</Muted>
      <View style={styles.stats}>
        <Stat label="Hours" value={formatDuration(stats.minutes)} />
        <Stat label="OT" value={formatDuration(otMinutes)} />
        <Stat label="Days" value={String(stats.days)} />
      </View>
      {gate.firstTask ? (
        <Card>
          <Text style={styles.h}>First assigned stop</Text>
          <Muted>
            {gate.firstTask.id} · {gate.firstTask.customerPlace.area}
            {gate.kmToFirst != null ? ` · ${formatKm(gate.kmToFirst)}` : ""}
            {gate.geoOk ? " · within 5 km" : ` · need ≤ ${SHIFT_START_KM} km`}
          </Muted>
          {gate.rosterWindow ? (
            <Muted>
              Roster {gate.rosterWindow}
              {gate.rosterOk ? " · login window open" : " · outside login window"}
            </Muted>
          ) : (
            <Muted>No roster window for today (IST).</Muted>
          )}
        </Card>
      ) : live && nearer ? (
        <Card>
          <Text style={styles.h}>Nearest hub</Text>
          <Muted>
            {nearer} · {hubKm != null ? formatKm(hubKm) : "—"}
          </Muted>
        </Card>
      ) : null}
      <Card>
        <Text style={styles.h}>{openShift ? t(lang, "onShift") : t(lang, "clockIn")}</Text>
        {openShift ? (
          <>
            <Muted>Started {formatWhen(openShift.clockIn)}</Muted>
            {openShift.otRequested ? <Muted>Overtime requested for this shift.</Muted> : null}
            <Button label={t(lang, "otRequest")} variant="ghost" onPress={requestOt} />
            <Button label={t(lang, "clockOut")} variant="outline" onPress={clockOut} />
          </>
        ) : (
          <>
            <Muted>
              Start within 5 km of the first assigned stop, or during roster login hours (30 min early through end of
              window). Otherwise enter a reason.
            </Muted>
            <ChipWrap>
              {LOCATION_PRESETS.filter((p) =>
                p.id === "live" || p.id === "banjara" || p.id === "hitec" || p.id === "gachibowli" || p.id === "jubilee",
              ).map((p) => {
                const id = p.id === "live" ? "gps" : p.id;
                return (
                  <Chip
                    key={p.id}
                    label={p.label.replace(" Hills hub", "").replace(" City hub", "").replace(" customer", "")}
                    selected={locationMode === id}
                    onPress={() => setLocationMode(id)}
                  />
                );
              })}
            </ChipWrap>
            <CheckRow label="Helmet on" checked={helmet} onToggle={() => setHelmet((v) => !v)} />
            <CheckRow
              label="Two-wheeler / vehicle check"
              checked={twoWheeler}
              onToggle={() => setTwoWheeler((v) => !v)}
              hint="Lights, brakes, bag straps"
            />
            <Field
              label="Override reason"
              value={reason}
              onChangeText={setReason}
              placeholder="Traffic / GPS error / customer site start"
            />
            <Button label="Selfie punch-in" onPress={() => void selfieThenClock()} />
          </>
        )}
      </Card>
      <Card>
        <Text style={styles.h}>Time split (GPS trail)</Text>
        <Muted>Hub · travel · customer · vendor, tagged from the shift trail.</Muted>
        {(() => {
          const today = istYmd();
          const split = activityMinutes(state.pings.filter((p) => p.at.slice(0, 10) === today || p.at.startsWith(today)));
          return (
            <View style={styles.stats}>
              <Stat label="Hub" value={formatDuration(split.hub)} />
              <Stat label="Travel" value={formatDuration(split.travel)} />
              <Stat label="Customer" value={formatDuration(split.customer)} />
              <Stat label="Vendor" value={formatDuration(split.vendor)} />
            </View>
          );
        })()}
      </Card>
      <Text style={styles.h}>Roster</Text>
      {ROSTER.map((r) => (
        <Card key={r.date}>
          <Text style={styles.body}>{r.date}</Text>
          <Muted>
            {r.window} · {r.hub}
          </Muted>
        </Card>
      ))}
      <Text style={styles.h}>This month</Text>
      {[...state.shifts].reverse().map((s) => (
        <Card key={s.id}>
          <Text style={styles.body}>{s.date}</Text>
          <Muted>
            {new Date(s.clockIn).toLocaleTimeString()} →{" "}
            {s.clockOut ? new Date(s.clockOut).toLocaleTimeString() : "open"}
            {s.geofenceOverride ? " · override" : ""}
            {s.otRequested ? " · OT" : ""}
          </Muted>
        </Card>
      ))}
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
  stats: { flexDirection: "row", gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.peachBorder,
  },
});
