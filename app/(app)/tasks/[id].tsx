import { useState } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Button, Card, Muted } from "@/components/ui";
import { CheckRow, Chip, ChipWrap, StepRow } from "@/components/chips";
import { GeoCamera } from "@/components/geo-camera";
import { MiniMap } from "@/components/mini-map";
import { SignaturePad } from "@/components/signature-pad";
import { KindBadge, SlaBadge, StatusBadge } from "@/components/task-badges";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { ATTEMPT_LABELS, CHECK_IN_KM, KIT_GRADES, checkInTarget } from "@/lib/field-ops";
import { formatCoord, formatKm, haversineKm, mapsDirUrl } from "@/lib/geo";
import { formatWhen } from "@/lib/hours";
import { t } from "@/lib/i18n";
import type { AttemptCode, KitCondition, KitConditionGrade, TaskKind } from "@/lib/types";

function checkpoints(kind: TaskKind) {
  if (kind === "address_verification") return ["Address / nameplate"];
  if (kind === "delivery") return ["Store pickup", "Customer delivery"];
  if (kind === "return") return ["Customer pickup", "Store drop"];
  if (kind === "vendor_visit") return ["Storefront / visiting card"];
  return ["Shelf / bay"];
}

export default function TaskDetailScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const { state, live, setTaskStatus, updateTask, verifyOtp, generateOtp, matchSerial, sendWhatsApp, addDamage, checkInTask, logAttempt, saveKitCondition, saveSignature } =
    useApp();
  const lang = state.language;
  const [otp, setOtp] = useState("");
  const [pinStep, setPinStep] = useState<"show" | "enter">("show");
  const [serial, setSerial] = useState("");
  const [dmg, setDmg] = useState("");
  const [attemptCode, setAttemptCode] = useState<AttemptCode>("customer_unavailable");
  const [attemptNote, setAttemptNote] = useState("");
  const [kitGrade, setKitGrade] = useState<KitConditionGrade>("good");
  const [kitScuff, setKitScuff] = useState(false);
  const [kitDent, setKitDent] = useState(false);
  const [kitMissing, setKitMissing] = useState(false);
  const [kitNotes, setKitNotes] = useState("");
  const task = state.tasks.find((t) => t.id === id);

  if (!task) {
    return (
      <View style={styles.wrap}>
        <Muted>Task not found.</Muted>
      </View>
    );
  }

  const current = task;

  const you = live ?? task.store.geo;
  const storeCustKm = haversineKm(task.store.geo, task.customerPlace.geo);
  const youStore = haversineKm(you, task.store.geo);
  const youCust = haversineKm(you, task.customerPlace.geo);
  const nextLeg =
    task.kind === "return"
      ? { label: "Customer (pickup)", place: task.customerPlace, km: youCust }
      : task.kind === "delivery" && task.status === "assigned"
        ? { label: "Store (pickup)", place: task.store, km: youStore }
        : { label: "Customer", place: task.customerPlace, km: youCust };

  const photosOk = (checkpoint: string) => task.photos.some((p) => p.checkpoint === checkpoint);

  function complete() {
    const need = checkpoints(current.kind);
    const missing = need.filter((c) => !photosOk(c));
    if (missing.length) {
      Alert.alert("Photos needed", `Add geotagged photos first: ${missing.join(", ")}`);
      return;
    }
    if (!current.checkedInAt) {
      Alert.alert("GPS check-in", `Check in within ${Math.round(CHECK_IN_KM * 1000)} m of the stop (live GPS).`);
      return;
    }
    if (current.kind === "address_verification" && current.addressMatch === "unverified") {
      Alert.alert("Address result", "Mark whether the site matches the booking.");
      return;
    }
    if (current.kind === "vendor_visit") {
      const visited = state.vendorVisits.some((v) => v.vendorId === current.vendorId) || current.photos.length > 0;
      if (!visited) {
        Alert.alert("Visit proof", "Log the visit on the Onboard tab (interest + next meeting).");
        return;
      }
      const intel = current.vendorIntel;
      const skipIntel = current.vendorOutcome === "courtesy" || current.vendorOutcome === "not_interested" || current.vendorOutcome === "declined";
      if (!skipIntel && (!intel?.gstin || !intel.decisionMaker || !intel.competitor || !intel.ownedKit || !intel.nextShootDate)) {
        Alert.alert("Must-ask", "Complete vendor intel on the onboarding card before closing.");
        return;
      }
    } else if ((current.kind === "delivery" || current.kind === "return") && !current.otpVerified) {
      Alert.alert("Handover PIN", "Generate an in-app PIN and have the customer confirm it. No SMS.");
      return;
    }
    if ((current.kind === "delivery" || current.kind === "return") && !current.signatureSvg) {
      Alert.alert("Signature", "Capture a POD signature on this screen.");
      return;
    }
    if (current.kind === "delivery" && !current.kitPickupCondition) {
      Alert.alert("Kit condition", "Log pickup condition (good / scuff / dent / missing).");
      return;
    }
    if (current.kind === "return" && !current.kitReturnCondition) {
      Alert.alert("Kit condition", "Log return condition before closing.");
      return;
    }
    if (current.kind === "inventory") {
      const missing = current.items.filter(
        (i) => current.inventoryCounted?.[i.sku] == null || Number.isNaN(Number(current.inventoryCounted[i.sku])),
      );
      if (missing.length) {
        Alert.alert("Count required", "Enter a counted qty for every SKU on this bay.");
        return;
      }
    } else if (current.items.length && (current.scannedSerials?.length ?? 0) < current.items.length) {
      Alert.alert("Serials", "Match every kit serial before closing.");
      return;
    }
    setTaskStatus(current.id, "completed", "Task completed with geotagged proof");
    Alert.alert("Done", "Task closed.");
  }

  const photosNeed = checkpoints(task.kind);
  const photosMissing = photosNeed.filter((c) => !photosOk(c));
  const serialsDone = !task.items.length || task.kind === "inventory" || (task.scannedSerials?.length ?? 0) >= task.items.length;
  const kitDone =
    task.kind === "delivery"
      ? !!task.kitPickupCondition
      : task.kind === "return"
        ? !!task.kitReturnCondition
        : true;
  const pinDone = task.kind !== "delivery" && task.kind !== "return" ? true : !!task.otpVerified;
  const sigDone = task.kind !== "delivery" && task.kind !== "return" ? true : !!task.signatureSvg;
  const steps = [
    { label: "GPS check-in", done: !!task.checkedInAt },
    { label: "Geotagged photos", done: photosMissing.length === 0 },
    { label: "Kit condition", done: kitDone },
    { label: "Serials", done: serialsDone },
    { label: "Handover PIN", done: pinDone },
    { label: "POD signature", done: sigDone },
  ].filter((s) => {
    if (s.label === "Kit condition" && task.kind !== "delivery" && task.kind !== "return") return false;
    if (s.label === "Serials" && (!task.items.length || task.kind === "inventory")) return false;
    if ((s.label === "Handover PIN" || s.label === "POD signature") && task.kind !== "delivery" && task.kind !== "return")
      return false;
    return true;
  });
  const stepsLeft = steps.filter((s) => !s.done).length;

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <KindBadge kind={task.kind} />
        <StatusBadge status={task.status} />
        <SlaBadge task={task} />
      </View>
      <Text style={styles.title}>{task.title}</Text>
      <Muted>
        {task.bookingRef}
        {task.beatSeq ? ` · beat ${task.beatSeq}` : ""}
        {task.beatWindow ? ` · ${task.beatWindow}` : ""} · due {formatWhen(task.scheduledFor)}
      </Muted>

      {task.status !== "completed" ? (
        <Card>
          <Text style={styles.h}>Close-out · {stepsLeft === 0 ? "ready" : `${stepsLeft} left`}</Text>
          {steps.map((s) => (
            <StepRow key={s.label} label={s.label} done={s.done} />
          ))}
        </Card>
      ) : null}

      <MiniMap
        height={140}
        markers={[
          { id: "you", label: "You", color: colors.primary, point: you },
          { id: "store", label: "Store", color: colors.orange, point: task.store.geo },
          { id: "cust", label: "Customer", color: colors.success, point: task.customerPlace.geo },
        ]}
      />

      <Card>
        <Text style={styles.h}>Navigate</Text>
        <Text style={styles.distLine}>
          Store ↔ customer {formatKm(storeCustKm)} · you → {nextLeg.label} {formatKm(nextLeg.km)}
        </Text>
        <Button
          label={`Maps · ${nextLeg.label}`}
          variant="outline"
          onPress={() => void Linking.openURL(mapsDirUrl(you, nextLeg.place.geo))}
        />
      </Card>

      <Card>
        <Text style={styles.h}>Outlet GPS check-in</Text>
        <Muted>
          Live GPS at the stop — not the storefront photo. Stay within {Math.round(CHECK_IN_KM * 1000)} m of{" "}
          {task.kind === "delivery" && task.status === "assigned" ? task.store.area : task.customerPlace.area}.
        </Muted>
        {task.checkedInAt ? (
          <View style={styles.okBox}>
            <Text style={styles.okTxt}>Checked in {formatWhen(task.checkedInAt)}</Text>
          </View>
        ) : (
          <Button
            label="Check in with GPS"
            onPress={() => {
              const err = checkInTask(task.id);
              if (err) Alert.alert("Check-in blocked", err);
            }}
          />
        )}
        {live ? (
          <Muted>
            You are {formatKm(haversineKm(live, checkInTarget(task)))} from the stop
            {live.source === "gps" ? " · device GPS" : " · simulated pin"}
          </Muted>
        ) : (
          <Muted>Waiting for a GPS fix. Pick a customer pin on Home if you are demoing.</Muted>
        )}
      </Card>

      {task.kind === "delivery" || task.kind === "return" ? (
        <Card>
          <Text style={styles.h}>{task.kind === "delivery" ? "Kit condition · pickup" : "Kit condition · return"}</Text>
          <Muted>Good / scuff / dent / missing parts before the bag leaves or returns.</Muted>
          <ChipWrap>
            {KIT_GRADES.map((g) => (
              <Chip key={g.id} label={g.label} selected={kitGrade === g.id} onPress={() => setKitGrade(g.id)} />
            ))}
          </ChipWrap>
          <CheckRow label="Scuff" checked={kitScuff} onToggle={() => setKitScuff((v) => !v)} />
          <CheckRow label="Dent" checked={kitDent} onToggle={() => setKitDent((v) => !v)} />
          <CheckRow label="Missing parts" checked={kitMissing} onToggle={() => setKitMissing((v) => !v)} />
          <TextInput value={kitNotes} onChangeText={setKitNotes} placeholder="Bag notes" style={styles.qty} />
          <Button
            label="Save kit condition"
            onPress={() => {
              const row: KitCondition = {
                overall: kitGrade,
                scuff: kitScuff || kitGrade === "scuff",
                dent: kitDent || kitGrade === "dent",
                missingParts: kitMissing || kitGrade === "missing",
                notes: kitNotes.trim(),
              };
              saveKitCondition(task.id, task.kind === "return" ? "return" : "pickup", row);
              Alert.alert("Saved", "Kit condition logged on this job.");
            }}
          />
          {(task.kitPickupCondition || task.kitReturnCondition) ? (
            <Muted>
              Logged: {(task.kind === "return" ? task.kitReturnCondition : task.kitPickupCondition)?.overall}
            </Muted>
          ) : null}
        </Card>
      ) : null}

      {task.status !== "completed" ? (
        <Card>
          <Text style={styles.h}>Failed attempt</Text>
          <Muted>NSZ, customer unavailable, kit refused, weather, vehicle, address — then retry.</Muted>
          <ChipWrap>
            {(Object.keys(ATTEMPT_LABELS) as AttemptCode[]).map((code) => (
              <Chip
                key={code}
                label={ATTEMPT_LABELS[code]}
                selected={attemptCode === code}
                tone={code === "nsz" || code === "kit_refused" ? "danger" : "default"}
                onPress={() => setAttemptCode(code)}
              />
            ))}
          </ChipWrap>
          <TextInput value={attemptNote} onChangeText={setAttemptNote} placeholder="What happened on this try?" style={styles.qty} />
          <Button
            label="Log failed attempt"
            variant="danger"
            onPress={() => {
              logAttempt(task.id, attemptCode, attemptNote.trim());
              setAttemptNote("");
            }}
          />
          {task.status === "blocked" ? (
            <Button
              label="Retry this stop"
              onPress={() => setTaskStatus(task.id, "in_progress", "Retry after failed attempt")}
            />
          ) : null}
          {(task.attempts ?? []).map((a) => (
            <Muted key={a.at}>
              {formatWhen(a.at)} · {ATTEMPT_LABELS[a.code]}
              {a.note ? ` · ${a.note}` : ""}
            </Muted>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.h}>Rental store</Text>
        <Muted>
          {task.store.name} · {task.store.address}
        </Muted>
        {task.store.phone ? (
          <Pressable onPress={() => void Linking.openURL(`tel:${task.store.phone!.replace(/\s/g, "")}`)}>
            <Text style={styles.link}>{task.store.phone}</Text>
          </Pressable>
        ) : null}
        <Text style={styles.h}>Customer</Text>
        <Muted>
          {task.customerPlace.name} · {task.customerPlace.address}
        </Muted>
        <Pressable onPress={() => void Linking.openURL(`tel:${task.customerPhone.replace(/\s/g, "")}`)}>
          <Text style={styles.link}>{task.customerPhone}</Text>
        </Pressable>
        <Muted>{task.notes}</Muted>
      </Card>

      {task.items.length > 0 ? (
        <Card>
          <Text style={styles.h}>Equipment</Text>
          {task.items.map((item) => (
            <View key={item.serial} style={styles.item}>
              <Text style={{ fontWeight: "600" }}>
                {item.name} × {item.qty}
              </Text>
              <Muted>
                {item.sku} · {item.serial} · {item.condition}
              </Muted>
              {task.kind === "inventory" ? (
                <TextInput
                  keyboardType="number-pad"
                  placeholder="Counted qty"
                  value={task.inventoryCounted?.[item.sku] != null ? String(task.inventoryCounted[item.sku]) : ""}
                  onChangeText={(v) =>
                    updateTask(task.id, {
                      inventoryCounted: { ...task.inventoryCounted, [item.sku]: Number(v) },
                    })
                  }
                  style={styles.qty}
                />
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      {task.kind === "address_verification" ? (
        <Card>
          <Text style={styles.h}>Address result</Text>
          <ChipWrap>
            <Chip
              label="Matches booking"
              selected={task.addressMatch === "match"}
              onPress={() => updateTask(task.id, { addressMatch: "match" })}
            />
            <Chip
              label="Does not match"
              selected={task.addressMatch === "mismatch"}
              tone="danger"
              onPress={() => updateTask(task.id, { addressMatch: "mismatch" })}
            />
          </ChipWrap>
        </Card>
      ) : null}

      {task.kind === "vendor_visit" && task.vendorId ? (
        <Card>
          <Text style={styles.h}>Vendor onboarding</Text>
          <Muted>Market Camartes and onboard this partner onto the platform.</Muted>
          <Button label="Open vendor card" onPress={() => router.push(`/(app)/vendors/${task.vendorId}`)} />
        </Card>
      ) : null}

      {task.kind === "delivery" || task.kind === "return" ? (
        <Card>
          <Text style={styles.h}>{t(lang, "otp")}</Text>
          {task.otpVerified ? (
            <Muted>In-app PIN confirmed. Handover is locked on this booking.</Muted>
          ) : (
            <>
              <Muted>
                Create the 4-digit PIN in this app and show it to the customer. Do not send it by SMS.
              </Muted>
              {task.otpCode && task.otpGeneratedAt ? (
                pinStep === "show" ? (
                  <>
                    <Text style={styles.pin}>{task.otpCode}</Text>
                    <Muted>Show this number to the customer, then hide it before they type.</Muted>
                    <Button label="Customer will type PIN" onPress={() => setPinStep("enter")} />
                    <Button
                      label="Generate new PIN"
                      variant="outline"
                      onPress={() => {
                        generateOtp(task.id);
                        setOtp("");
                        setPinStep("show");
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Muted>PIN is hidden. Customer types the 4 digits they just saw.</Muted>
                    <TextInput
                      value={otp}
                      onChangeText={setOtp}
                      placeholder="Customer types PIN"
                      keyboardType="number-pad"
                      maxLength={4}
                      style={styles.qty}
                      secureTextEntry
                    />
                    <Button
                      label={t(lang, "verifyOtp")}
                      onPress={() => {
                        if (!verifyOtp(task.id, otp)) Alert.alert("Wrong PIN", "It must match the PIN that was shown.");
                        else setOtp("");
                      }}
                    />
                    <Button label="Show PIN again" variant="ghost" onPress={() => setPinStep("show")} />
                  </>
                )
              ) : (
                <Button
                  label="Generate handover PIN"
                  onPress={() => {
                    generateOtp(task.id);
                    setOtp("");
                    setPinStep("show");
                  }}
                />
              )}
            </>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ flex: 1, marginRight: 8 }}>Customer confirmed kit handover</Text>
            <Switch
              value={!!task.customerConfirmed}
              onValueChange={(v) => updateTask(task.id, { customerConfirmed: v })}
              trackColor={{ true: colors.primary }}
            />
          </View>
          <Button label="WhatsApp ETA" variant="outline" onPress={() => sendWhatsApp(task.id, "eta")} />
          <Button
            label={task.kind === "return" ? "WhatsApp collected" : "WhatsApp delivered"}
            variant="ghost"
            onPress={() => sendWhatsApp(task.id, task.kind === "return" ? "collected" : "delivered")}
          />
        </Card>
      ) : null}

      {task.kind === "delivery" || task.kind === "return" ? (
        <Card>
          <Text style={styles.h}>POD signature</Text>
          <Muted>Customer signs here. PIN still required — this is the paper trail, not a substitute.</Muted>
          <SignaturePad value={task.signatureSvg} onChange={(svg) => saveSignature(task.id, svg)} />
          {task.signatureSvg ? <Muted>Signature captured.</Muted> : <Muted>Draw with a finger or mouse.</Muted>}
        </Card>
      ) : null}

      {task.items.length > 0 && task.kind !== "inventory" ? (
        <Card>
          <Text style={styles.h}>{t(lang, "serials")}</Text>
          <Muted>
            {(task.scannedSerials?.length ?? 0)}/{task.items.length} kits confirmed
          </Muted>
          {task.items.map((item) => (
            <Text key={item.serial} style={{ fontWeight: "600" }}>
              {(task.scannedSerials ?? []).includes(item.serial) ? "✓" : "○"} {item.name} · {item.serial}
            </Text>
          ))}
          <TextInput value={serial} onChangeText={setSerial} placeholder="Full serial or last 4 digits" style={styles.qty} />
          <Button
            label={t(lang, "scanSerial")}
            variant="outline"
            onPress={() => {
              if (!matchSerial(task.id, serial)) Alert.alert("No match", "Use the full serial or the last 4 characters.");
              else setSerial("");
            }}
          />
        </Card>
      ) : null}

      {task.status !== "completed" ? (
        <Card>
          <Text style={styles.h}>{t(lang, "damage")}</Text>
          <TextInput value={dmg} onChangeText={setDmg} placeholder="What happened?" style={styles.qty} />
          <Button
            label="Log exception"
            variant="ghost"
            onPress={() => {
              addDamage({
                taskId: task.id,
                serial: serial || task.items[0]?.serial || "kit",
                note: dmg.trim() || "Kit flagged on site",
              });
              setDmg("");
              Alert.alert("Logged", "Hub will review the exception.");
            }}
          />
          {state.damages
            .filter((d) => d.taskId === task.id)
            .map((d) => (
              <Muted key={d.id}>
                {d.serial} · {d.note}
              </Muted>
            ))}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.h}>Geotagged photos</Text>
        {checkpoints(task.kind).map((cp) => (
          <View key={cp} style={styles.item}>
            <Text style={{ fontWeight: "600" }}>{cp}</Text>
            <GeoCamera taskId={task.id} checkpoint={cp} />
          </View>
        ))}
        {task.photos.map((p) => (
          <View key={p.id} style={styles.item}>
            <Image source={{ uri: p.uri }} style={{ height: 180, borderRadius: 8 }} />
            <Muted>
              {p.checkpoint} · {formatCoord(p.geo.lat, 6)}, {formatCoord(p.geo.lng, 6)} ±{Math.round(p.geo.accuracyM)}m
            </Muted>
            <Muted>{new Date(p.geo.capturedAt).toLocaleString()}</Muted>
            {p.note ? <Muted>Note: {p.note}</Muted> : null}
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.h}>Timeline</Text>
        {task.timeline.map((ev) => (
          <Muted key={ev.id}>
            {formatWhen(ev.at)} · {ev.label}
          </Muted>
        ))}
      </Card>

      {task.status === "assigned" ? (
        <Button
          label="Start task"
          onPress={() => setTaskStatus(task.id, "in_progress", "Started — travelling to first stop")}
        />
      ) : null}
      {task.status !== "completed" ? (
        <Button
          label={stepsLeft ? `Mark complete · ${stepsLeft} left` : "Mark complete"}
          variant={task.status === "assigned" ? "outline" : "primary"}
          onPress={complete}
        />
      ) : (
        <Muted>Closed {task.completedAt ? formatWhen(task.completedAt) : ""}</Muted>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, backgroundColor: colors.bg, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  h: { fontSize: 16, fontWeight: "700", color: colors.text },
  link: { color: colors.primaryDark, fontWeight: "600" },
  item: { borderWidth: 1, borderColor: colors.peachBorder, borderRadius: 10, padding: 10, gap: 6 },
  qty: { borderWidth: 1, borderColor: colors.peachBorder, borderRadius: 8, padding: 8, backgroundColor: "#fff" },
  pin: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 8,
    color: colors.primaryDark,
    textAlign: "center",
    paddingVertical: 8,
  },
  distLine: { fontSize: 14, color: colors.ink, fontWeight: "600" },
  okBox: {
    backgroundColor: colors.successBg,
    borderRadius: 10,
    padding: 10,
  },
  okTxt: { color: "#047857", fontWeight: "700" },
});
