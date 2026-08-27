import { useState } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Button, Card, Muted } from "@/components/ui";
import { GeoCamera } from "@/components/geo-camera";
import { MiniMap } from "@/components/mini-map";
import { KindBadge, StatusBadge } from "@/components/task-badges";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { formatCoord, formatKm, haversineKm, mapsDirUrl } from "@/lib/geo";
import { formatWhen } from "@/lib/hours";
import { t } from "@/lib/i18n";
import type { TaskKind } from "@/lib/types";

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
  const { state, live, setTaskStatus, updateTask, verifyOtp, matchSerial, sendWhatsApp, addDamage } = useApp();
  const lang = state.language;
  const [otp, setOtp] = useState("");
  const [serial, setSerial] = useState("");
  const [dmg, setDmg] = useState("");
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
    if (current.kind === "address_verification" && current.addressMatch === "unverified") {
      Alert.alert("Address result", "Mark whether the site matches the booking.");
      return;
    }
    if (current.kind === "vendor_visit") {
      const visited = state.vendorVisits.some((v) => v.vendorId === current.vendorId) || current.photos.length > 0;
      if (!visited) {
        Alert.alert("Visit proof", "Log the vendor visit (Vendors tab) or capture a storefront photo.");
        return;
      }
    } else if ((current.kind === "delivery" || current.kind === "return") && !current.otpVerified) {
      Alert.alert("OTP", "Customer OTP is required for handover.");
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

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <KindBadge kind={task.kind} />
        <StatusBadge status={task.status} />
      </View>
      <Text style={styles.title}>{task.title}</Text>
      <Muted>
        {task.bookingRef} · due {formatWhen(task.scheduledFor)}
      </Muted>

      <MiniMap
        markers={[
          { id: "you", label: "You", color: colors.primary, point: you },
          { id: "store", label: "Store", color: colors.orange, point: task.store.geo },
          { id: "cust", label: "Customer", color: colors.success, point: task.customerPlace.geo },
        ]}
      />

      <Card>
        <Text style={styles.h}>Distances</Text>
        <Text>Store ↔ customer: {formatKm(storeCustKm)}</Text>
        <Text>You → store: {formatKm(youStore)}</Text>
        <Text>You → customer: {formatKm(youCust)}</Text>
        <Button
          label={`Navigate to ${nextLeg.label} (${formatKm(nextLeg.km)})`}
          variant="outline"
          onPress={() => void Linking.openURL(mapsDirUrl(you, nextLeg.place.geo))}
        />
      </Card>

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
          <Button
            label="Matches booking"
            variant={task.addressMatch === "match" ? "primary" : "outline"}
            onPress={() => updateTask(task.id, { addressMatch: "match" })}
          />
          <Button
            label="Does not match"
            variant={task.addressMatch === "mismatch" ? "danger" : "outline"}
            onPress={() => updateTask(task.id, { addressMatch: "mismatch" })}
          />
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
          <Text style={styles.h}>{t(lang, "proof")}</Text>
          {task.otpVerified ? (
            <Muted>OTP accepted. Customer handover PIN is on file.</Muted>
          ) : (
            <>
              <Muted>
                Ask the customer for the 4-digit SMS PIN. Demo code {task.otpCode ?? "—"}.
              </Muted>
              <TextInput
                value={otp}
                onChangeText={setOtp}
                placeholder="4-digit OTP"
                keyboardType="number-pad"
                style={styles.qty}
              />
              <Button
                label={t(lang, "verifyOtp")}
                onPress={() => {
                  if (!verifyOtp(task.id, otp)) Alert.alert("Wrong OTP", "Ask the customer to resend.");
                  else setOtp("");
                }}
              />
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
          <TextInput value={serial} onChangeText={setSerial} placeholder="Type serial" style={styles.qty} />
          <Button
            label={t(lang, "scanSerial")}
            variant="outline"
            onPress={() => {
              if (!matchSerial(task.id, serial)) Alert.alert("No match", "Serial is not on this job sheet.");
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
        <Button label="Mark complete" variant={task.status === "assigned" ? "outline" : "primary"} onPress={complete} />
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
});
