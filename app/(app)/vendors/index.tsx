import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Badge, Button, Card, Field, Muted, Title } from "@/components/ui";
import { Chip, ChipWrap } from "@/components/chips";
import { MiniMap } from "@/components/mini-map";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { formatKm, haversineKm } from "@/lib/geo";
import { t } from "@/lib/i18n";
import {
  INTEREST_FILTERS,
  INTEREST_LABEL,
  badgeTone,
  clampServices,
  formatMeeting,
  interestOf,
  isOnboardingLead,
} from "@/lib/vendor-onboard";
import { VendorProfileFields } from "@/components/vendor-profile-fields";
import { LISTING_LABEL, VENDOR_KIND_LABEL } from "@/lib/vendors-seed";
import { SERVICE_TYPE_LABEL } from "@/lib/camartes-services";
import type { OnboardInterest, VendorKind, VendorListing } from "@/lib/types";

export default function VendorsScreen() {
  const { state, live, addWalkInVendor } = useApp();
  const you = live ?? { lat: 17.4126, lng: 78.4483 };
  const [filter, setFilter] = useState<"all" | OnboardInterest>("all");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [listing, setListing] = useState<VendorListing>("business");
  const [serviceTypes, setServiceTypes] = useState<VendorKind[]>([]);

  const pipeline = useMemo(
    () => state.vendors.filter(isOnboardingLead),
    [state.vendors],
  );

  const counts = useMemo(() => {
    const c: Record<OnboardInterest, number> = {
      to_meet: 0,
      interested: 0,
      need_time: 0,
      not_interested: 0,
      follow_up: 0,
      onboarded: 0,
    };
    for (const v of pipeline) {
      const i = interestOf(v);
      c[i] += 1;
    }
    return c;
  }, [pipeline]);

  const list = useMemo(() => {
    return pipeline
      .filter((v) => filter === "all" || interestOf(v) === filter)
      .map((v) => ({ ...v, km: haversineKm(you, v.geo) }))
      .sort((a, b) => {
        const am = a.nextMeetingAt ? new Date(a.nextMeetingAt).getTime() : Number.POSITIVE_INFINITY;
        const bm = b.nextMeetingAt ? new Date(b.nextMeetingAt).getTime() : Number.POSITIVE_INFINITY;
        if (am !== bm) return am - bm;
        const al = a.lastVisitedAt ? new Date(a.lastVisitedAt).getTime() : 0;
        const bl = b.lastVisitedAt ? new Date(b.lastVisitedAt).getTime() : 0;
        return bl - al;
      });
  }, [pipeline, filter, you.lat, you.lng]);

  function saveWalkIn() {
    const id = addWalkInVendor({
      name,
      contact,
      phone,
      area,
      address: area,
      listing,
      serviceTypes: clampServices(listing, serviceTypes),
    });
    if (!id) {
      Alert.alert("Could not add", "Name, contact person, and at least one service are required.");
      return;
    }
    setName("");
    setContact("");
    setPhone("");
    setArea("");
    setServiceTypes([]);
    setAdding(false);
    setTimeout(() => router.push(`/(app)/vendors/${id}`), 0);
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Title>{t(state.language, "vendors")}</Title>
      <Muted>
        Studios, freelancers and partners you met or are scheduled to meet to onboard them onto Camartes — not the
        public marketplace catalogue.
      </Muted>
      <Card>
        <Text style={styles.body}>
          {pipeline.length} in your book · {counts.interested} interested · {counts.need_time} need time ·{" "}
          {counts.not_interested} not interested
        </Text>
        <Muted>
          {counts.to_meet} still to meet · {counts.follow_up} follow-up · {counts.onboarded} onboarded
        </Muted>
      </Card>
      <MiniMap
        height={140}
        markers={[
          { id: "you", label: "You", color: colors.primary, point: you },
          ...list.slice(0, 10).map((v) => ({
            id: v.id,
            label: v.name.split(" ")[0],
            color: interestOf(v) === "not_interested" ? colors.ink : colors.orange,
            point: v.geo,
          })),
        ]}
      />
      <ChipWrap>
        <Chip label="All" selected={filter === "all"} onPress={() => setFilter("all")} />
        {INTEREST_FILTERS.map((id) => (
          <Chip
            key={id}
            label={`${INTEREST_LABEL[id]} (${counts[id]})`}
            selected={filter === id}
            tone={id === "not_interested" ? "danger" : "default"}
            onPress={() => setFilter(id)}
          />
        ))}
      </ChipWrap>
      {list.length === 0 ? (
        <Card>
          <Muted>
            No onboarding visits in this status. Log a walk-in after you meet an outlet, or change the filter.
          </Muted>
        </Card>
      ) : null}
      {list.map((v) => {
        const interest = interestOf(v);
        const next = formatMeeting(v.nextMeetingAt);
        const last = formatMeeting(v.lastVisitedAt);
        return (
          <Pressable key={v.id} onPress={() => router.push(`/(app)/vendors/${v.id}`)}>
            <Card>
              <View style={styles.row}>
                <Text style={[styles.body, { flex: 1 }]}>{v.name}</Text>
                <Badge label={INTEREST_LABEL[interest]} tone={badgeTone(interest)} />
              </View>
              <Muted>
                {LISTING_LABEL[v.listing]} · {v.contact} · {v.area} · {formatKm(v.km)}
              </Muted>
              {v.serviceTypes?.length ? (
                <Muted>{v.serviceTypes.map((s) => SERVICE_TYPE_LABEL[s] ?? s).join(" · ")}</Muted>
              ) : (
                <Muted>{VENDOR_KIND_LABEL[v.kind] ?? v.kind}</Muted>
              )}
              <Muted>
                {next ? `Next meeting · ${next}` : "No next meeting scheduled"}
                {v.nextMeetingNote ? ` · ${v.nextMeetingNote}` : ""}
              </Muted>
              {last ? <Muted>Last visit · {last}</Muted> : <Muted>Not visited yet</Muted>}
            </Card>
          </Pressable>
        );
      })}
      {adding ? (
        <Card>
          <Text style={styles.body}>Log a walk-in you just met</Text>
          <VendorProfileFields
            name={name}
            contact={contact}
            phone={phone}
            listing={listing}
            serviceTypes={serviceTypes}
            onName={setName}
            onContact={setContact}
            onPhone={setPhone}
            onListing={(next) => {
              setListing(next);
              setServiceTypes(clampServices(next, serviceTypes));
            }}
            onServices={setServiceTypes}
          />
          <Field label="Area" value={area} onChangeText={setArea} placeholder="Banjara Hills" />
          <Button label="Save to onboarding book" onPress={saveWalkIn} />
          <Button label="Cancel" variant="ghost" onPress={() => setAdding(false)} />
        </Card>
      ) : (
        <Button label="Add walk-in visit" variant="outline" onPress={() => setAdding(true)} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10, backgroundColor: colors.bg, paddingBottom: 48 },
  body: { fontSize: 16, fontWeight: "800", color: colors.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
