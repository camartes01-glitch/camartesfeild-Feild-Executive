import { useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Button, Card, Field, Muted, Title } from "@/components/ui";
import { GeoCamera } from "@/components/geo-camera";
import { MiniMap } from "@/components/mini-map";
import { colors } from "@/constants/theme";
import { useApp, toWhatsAppPhone } from "@/lib/app-context";
import { formatKm, haversineKm, mapsDirUrl } from "@/lib/geo";
import { SERVICE_TYPE_LABEL } from "@/lib/camartes-api";
import { LISTING_LABEL, VENDOR_KIND_LABEL } from "@/lib/vendors-seed";
import type { VendorVisitOutcome } from "@/lib/types";

const OUTCOMES: { id: VendorVisitOutcome; label: string }[] = [
  { id: "interested", label: "Interested" },
  { id: "follow_up", label: "Follow up" },
  { id: "onboarded", label: "Onboard to Camartes" },
  { id: "declined", label: "Declined" },
  { id: "courtesy", label: "Courtesy visit" },
];

export default function VendorDetailScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(raw) ? raw[0] : raw;
  const { state, live, logVendorVisit, onboardVendor } = useApp();
  const vendor = state.vendors.find((v) => v.id === id);
  const [outcome, setOutcome] = useState<VendorVisitOutcome>("interested");
  const [pitch, setPitch] = useState("Camartes marketplace — rentals, bookings, LED, WebLive");
  const [note, setNote] = useState("");

  if (!vendor) {
    return (
      <View style={styles.wrap}>
        <Muted>Vendor not found.</Muted>
      </View>
    );
  }

  const current = vendor;

  const you = live ?? vendor.geo;
  const km = haversineKm(you, vendor.geo);
  const visits = state.vendorVisits.filter((v) => v.vendorId === vendor.id);

  function save() {
    const err = logVendorVisit({ vendorId: current.id, outcome, pitch, note: note.trim() });
    if (err) {
      Alert.alert("Could not log visit", err);
      return;
    }
    let code: string | undefined;
    if (outcome === "onboarded") code = onboardVendor(current.id);
    Alert.alert(
      "Visit logged",
      code
        ? `Onboarded onto Camartes as ${code}.`
        : current.geoApprox
          ? "Saved. Map pin is city-level until storefront GPS is captured."
          : km < 0.4
            ? "On-site visit saved."
            : "Saved (not inside 400 m of the pin).",
    );
    setNote("");
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Title>{vendor.name}</Title>
      <Muted>
        {LISTING_LABEL[vendor.listing]} · {VENDOR_KIND_LABEL[vendor.kind] ?? vendor.kind} · {vendor.area}, {vendor.city}
      </Muted>
      <Muted>
        {vendor.source === "camartes" ? "Listed on camartes.com" : "Field walk-in"}
        {vendor.kycVerified ? " · KYC verified" : ""}
        {" · "}
        {vendor.contact} · {vendor.status.replace("_", " ")}
        {vendor.partnerCode ? ` · ${vendor.partnerCode}` : ""}
      </Muted>
      {vendor.serviceTypes?.length ? (
        <Muted>{vendor.serviceTypes.map((s) => SERVICE_TYPE_LABEL[s] ?? s).join(" · ")}</Muted>
      ) : null}
      <MiniMap
        markers={[
          { id: "you", label: "You", color: colors.primary, point: you },
          { id: "vn", label: vendor.name.split(" ")[0], color: colors.orange, point: vendor.geo },
        ]}
      />
      <Muted>
        You → vendor {formatKm(km)}
        {vendor.geoApprox ? " · city pin (no storefront GPS on camartes.com)" : ""}
        {live?.source === "gps" ? " · device GPS" : live ? " · simulated pin" : ""}
      </Muted>
      <Button
        label="Navigate"
        variant="outline"
        onPress={() => void Linking.openURL(mapsDirUrl(you, vendor.geo))}
      />
      {/\d{10}/.test(vendor.phone.replace(/\D/g, "")) ? (
        <Button
          label="Call"
          variant="ghost"
          onPress={() => void Linking.openURL(`tel:${vendor.phone.replace(/\s/g, "")}`)}
        />
      ) : null}
      {vendor.profileUrl ? (
        <Button
          label="Open on camartes.com"
          variant="outline"
          onPress={() => void Linking.openURL(vendor.profileUrl!)}
        />
      ) : null}
      {toWhatsAppPhone(vendor.phone).length >= 12 ? (
        <Button
          label="WhatsApp pitch"
          variant="ghost"
          onPress={() => {
            const msg = `Hi ${vendor.contact}, this is Camartes Field. We list photography studios, freelancers, LED walls and WebLive on camartes.com — can we onboard ${vendor.name}?`;
            void Linking.openURL(`https://wa.me/${toWhatsAppPhone(vendor.phone)}?text=${encodeURIComponent(msg)}`);
          }}
        />
      ) : null}
      <Card>
        <Text style={styles.h}>Address</Text>
        <Muted>{vendor.address}</Muted>
        <Muted>{vendor.notes}</Muted>
      </Card>
      <Card>
        <Text style={styles.h}>Log marketing visit</Text>
        {OUTCOMES.map((o) => (
          <Button
            key={o.id}
            label={o.label}
            variant={outcome === o.id ? "primary" : "outline"}
            onPress={() => setOutcome(o.id)}
          />
        ))}
        <Field label="Pitch" value={pitch} onChangeText={setPitch} />
        <Field label="Notes" value={note} onChangeText={setNote} placeholder="Decision maker, GST, next step…" />
        <Button label="Save visit" onPress={save} />
      </Card>
      <Card>
        <Text style={styles.h}>Storefront proof</Text>
        <GeoCamera taskId={vendor.id} checkpoint="Vendor storefront" />
        {(vendor.photos ?? []).map((p) => (
          <Muted key={p.id}>
            Proof · {p.geo.lat.toFixed(5)}, {p.geo.lng.toFixed(5)}
          </Muted>
        ))}
      </Card>
      {visits.length ? (
        <Card>
          <Text style={styles.h}>Visit history</Text>
          {visits.map((v) => (
            <Muted key={v.id}>
              {new Date(v.at).toLocaleString()} · {v.outcome}
              {v.onSite ? " · on site" : " · off site"} · {v.note || v.pitch}
            </Muted>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, backgroundColor: colors.bg, paddingBottom: 48 },
  h: { fontSize: 16, fontWeight: "800", color: colors.ink },
});
