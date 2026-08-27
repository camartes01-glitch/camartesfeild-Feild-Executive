import { useEffect, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Badge, Button, Card, Field, Muted, Title } from "@/components/ui";
import { Chip, ChipWrap } from "@/components/chips";
import { GeoCamera } from "@/components/geo-camera";
import { MiniMap } from "@/components/mini-map";
import { colors } from "@/constants/theme";
import { useApp, toWhatsAppPhone } from "@/lib/app-context";
import { formatKm, haversineKm, mapsDirUrl } from "@/lib/geo";
import { SERVICE_TYPE_LABEL } from "@/lib/camartes-api";
import { LISTING_LABEL, VENDOR_KIND_LABEL } from "@/lib/vendors-seed";
import {
  INTEREST_LABEL,
  badgeTone,
  clampServices,
  formatMeeting,
  interestOf,
  shiftIso,
  visitOutcomeLabel,
} from "@/lib/vendor-onboard";
import { VendorProfileFields } from "@/components/vendor-profile-fields";
import type { VendorKind, VendorListing, VendorVisitOutcome } from "@/lib/types";

const OUTCOMES: { id: VendorVisitOutcome; label: string }[] = [
  { id: "interested", label: "Interested" },
  { id: "need_time", label: "Need time" },
  { id: "not_interested", label: "Not interested" },
  { id: "follow_up", label: "Follow up" },
  { id: "onboarded", label: "Onboarded" },
  { id: "courtesy", label: "Courtesy visit" },
];

export default function VendorDetailScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(raw) ? raw[0] : raw;
  const { state, live, logVendorVisit } = useApp();
  const vendor = state.vendors.find((v) => v.id === id);
  const [outcome, setOutcome] = useState<VendorVisitOutcome>(vendor?.interest === "to_meet" ? "interested" : (vendor?.interest ?? "interested"));
  const [pitch, setPitch] = useState("Camartes marketplace — rentals, bookings, LED, WebLive");
  const [note, setNote] = useState("");
  const [gstin, setGstin] = useState(vendor?.gstin ?? "");
  const [decisionMaker, setDecisionMaker] = useState(vendor?.decisionMaker ?? "");
  const [competitor, setCompetitor] = useState(vendor?.competitor ?? "");
  const [ownedKit, setOwnedKit] = useState(vendor?.ownedKit ?? "");
  const [nextShoot, setNextShoot] = useState(vendor?.nextShootDate ?? "");
  const [declineReason, setDeclineReason] = useState(vendor?.declineReason ?? "");
  const [nextMeetingAt, setNextMeetingAt] = useState(vendor?.nextMeetingAt ?? "");
  const [nextMeetingNote, setNextMeetingNote] = useState(vendor?.nextMeetingNote ?? "");
  const [outletName, setOutletName] = useState(vendor?.name ?? "");
  const [contactName, setContactName] = useState(vendor?.contact ?? "");
  const [contactPhone, setContactPhone] = useState(vendor?.phone === "—" ? "" : (vendor?.phone ?? ""));
  const [listing, setListing] = useState<VendorListing>(vendor?.listing ?? "business");
  const [serviceTypes, setServiceTypes] = useState<VendorKind[]>(
    (vendor?.serviceTypes as VendorKind[] | undefined)?.length
      ? (vendor!.serviceTypes as VendorKind[])
      : vendor?.kind
        ? [vendor.kind]
        : [],
  );

  useEffect(() => {
    if (!vendor) return;
    setOutletName(vendor.name);
    setContactName(vendor.contact);
    setContactPhone(vendor.phone === "—" ? "" : vendor.phone);
    setListing(vendor.listing);
    setServiceTypes(
      vendor.serviceTypes?.length ? (vendor.serviceTypes as VendorKind[]) : vendor.kind ? [vendor.kind] : [],
    );
    setGstin(vendor.gstin ?? "");
    setDecisionMaker(vendor.decisionMaker ?? "");
    setCompetitor(vendor.competitor ?? "");
    setOwnedKit(vendor.ownedKit ?? "");
    setNextShoot(vendor.nextShootDate ?? "");
    setDeclineReason(vendor.declineReason ?? "");
    setNextMeetingAt(vendor.nextMeetingAt ?? "");
    setNextMeetingNote(vendor.nextMeetingNote ?? "");
    const i = interestOf(vendor);
    setOutcome(i === "to_meet" || i === "onboarded" ? "interested" : i);
  }, [vendor?.id]);

  if (!vendor) {
    return (
      <View style={styles.wrap}>
        <Muted>Vendor not found.</Muted>
      </View>
    );
  }

  const current = vendor;
  const interest = interestOf(vendor);
  const you = live ?? vendor.geo;
  const km = haversineKm(you, vendor.geo);
  const visits = state.vendorVisits.filter((v) => v.vendorId === vendor.id);
  const nextLabel = formatMeeting(vendor.nextMeetingAt);
  const lastLabel = formatMeeting(vendor.lastVisitedAt);

  function save() {
    const result = logVendorVisit({
      vendorId: current.id,
      outcome,
      pitch,
      note: note.trim(),
      intel: {
        gstin: gstin.trim(),
        decisionMaker: decisionMaker.trim() || contactName.trim(),
        competitor: competitor.trim(),
        ownedKit: ownedKit.trim(),
        nextShootDate: nextShoot.trim(),
      },
      declineReason: declineReason.trim() || undefined,
      nextMeetingAt: nextMeetingAt.trim() || undefined,
      nextMeetingNote: nextMeetingNote.trim() || undefined,
      profile: {
        name: outletName,
        contact: contactName,
        phone: contactPhone,
        listing,
        serviceTypes,
      },
    });
    if ("error" in result) {
      Alert.alert("Could not log visit", result.error);
      return;
    }
    Alert.alert(
      "Visit logged",
      result.partnerCode
        ? `Onboarded onto Camartes as ${result.partnerCode}.`
        : nextMeetingAt.trim()
          ? `Saved. Next meeting ${formatMeeting(nextMeetingAt) ?? nextMeetingAt}.`
          : km < 0.4
            ? "On-site visit saved."
            : "Visit saved.",
    );
    setNote("");
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Title>{vendor.name}</Title>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <Badge label={INTEREST_LABEL[interest]} tone={badgeTone(interest)} />
        {vendor.source === "field" ? <Badge label="Walk-in" tone="peach" /> : <Badge label="camartes.com" tone="violet" />}
      </View>
      <Muted>
        {LISTING_LABEL[vendor.listing]} · {VENDOR_KIND_LABEL[vendor.kind] ?? vendor.kind} · {vendor.area}, {vendor.city}
      </Muted>
      <Muted>
        {vendor.contact}
        {vendor.partnerCode ? ` · ${vendor.partnerCode}` : ""}
        {vendor.kycVerified ? " · KYC verified" : ""}
      </Muted>
      <Card>
        <Text style={styles.h}>Meetings</Text>
        <Muted>{nextLabel ? `Next · ${nextLabel}` : "No next meeting scheduled"}</Muted>
        {vendor.nextMeetingNote ? <Muted>{vendor.nextMeetingNote}</Muted> : null}
        <Muted>{lastLabel ? `Last visit · ${lastLabel}` : "Not visited yet"}</Muted>
      </Card>
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
        {vendor.geoApprox ? " · city pin" : ""}
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
      {toWhatsAppPhone(vendor.phone).length >= 12 ? (
        <Button
          label="WhatsApp"
          variant="ghost"
          onPress={() => {
            const msg = `Hi ${vendor.contact}, this is Camartes Field. Following up on onboarding ${vendor.name} onto camartes.com.`;
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
        <Text style={styles.h}>Log onboarding visit</Text>
        <Muted>Fill who they are and what they offer, then how they responded.</Muted>
        <VendorProfileFields
          name={outletName}
          contact={contactName}
          phone={contactPhone}
          listing={listing}
          serviceTypes={serviceTypes}
          onName={setOutletName}
          onContact={setContactName}
          onPhone={setContactPhone}
          onListing={(next) => {
            setListing(next);
            setServiceTypes(clampServices(next, serviceTypes));
          }}
          onServices={setServiceTypes}
        />
        <Muted>How did they respond to joining Camartes?</Muted>
        <ChipWrap>
          {OUTCOMES.map((o) => (
            <Chip
              key={o.id}
              label={o.label}
              selected={outcome === o.id}
              tone={o.id === "not_interested" ? "danger" : "default"}
              onPress={() => setOutcome(o.id)}
            />
          ))}
        </ChipWrap>
        {outcome === "not_interested" ? (
          <Field
            label="Why not interested (mandatory)"
            value={declineReason}
            onChangeText={setDeclineReason}
            placeholder="Price / exclusive contract / already listed elsewhere…"
          />
        ) : null}
        <Muted>Next meeting</Muted>
        <ChipWrap>
          <Chip label="Tomorrow 11:00" selected={nextMeetingAt === shiftIso(1)} onPress={() => setNextMeetingAt(shiftIso(1))} />
          <Chip label="In 2 days" selected={nextMeetingAt === shiftIso(2)} onPress={() => setNextMeetingAt(shiftIso(2))} />
          <Chip label="Next week" selected={nextMeetingAt === shiftIso(7)} onPress={() => setNextMeetingAt(shiftIso(7))} />
          <Chip label="Clear" selected={!nextMeetingAt} onPress={() => setNextMeetingAt("")} />
        </ChipWrap>
        <Field
          label="Next meeting (ISO or YYYY-MM-DDTHH:mm)"
          value={nextMeetingAt}
          onChangeText={setNextMeetingAt}
          placeholder="2026-08-28T11:00:00+05:30"
        />
        <Field
          label="Meeting note"
          value={nextMeetingNote}
          onChangeText={setNextMeetingNote}
          placeholder="Bring listing demo / meet owner"
        />
        {outcome !== "courtesy" && outcome !== "not_interested" ? (
          <>
            <Field label="GSTIN" value={gstin} onChangeText={setGstin} placeholder="Required except courtesy / not interested" />
            <Field label="Decision maker" value={decisionMaker} onChangeText={setDecisionMaker} placeholder="Name / role — defaults to contact person" />
            <Field label="Competitor in use" value={competitor} onChangeText={setCompetitor} placeholder="Who they work with today" />
            <Field label="Owned kit" value={ownedKit} onChangeText={setOwnedKit} placeholder="Bodies / lights they already own" />
            <Field label="Next shoot date" value={nextShoot} onChangeText={setNextShoot} placeholder="YYYY-MM-DD or week" />
          </>
        ) : null}
        <Field label="Pitch" value={pitch} onChangeText={setPitch} />
        <Field label="Visit notes" value={note} onChangeText={setNote} placeholder="Anything extra for the city manager" />
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
              {new Date(v.at).toLocaleString()} · {visitOutcomeLabel(v.outcome)}
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
