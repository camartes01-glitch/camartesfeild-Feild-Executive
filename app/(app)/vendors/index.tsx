import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, Muted, Title } from "@/components/ui";
import { MiniMap } from "@/components/mini-map";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { SERVICE_TYPE_LABEL } from "@/lib/camartes-api";
import { formatKm, haversineKm } from "@/lib/geo";
import { LISTING_LABEL, VENDOR_KIND_LABEL } from "@/lib/vendors-seed";
import { t } from "@/lib/i18n";
import type { VendorKind, VendorListing } from "@/lib/types";

const KIND_FILTERS: { id: "all" | VendorKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "rental_store", label: "Rental" },
  { id: "photography_studio", label: "Studio" },
  { id: "freelance_photographer", label: "Photo" },
  { id: "videographer", label: "Video" },
  { id: "video_editor", label: "Editor" },
  { id: "album_designer", label: "Album" },
  { id: "led_wall", label: "LED" },
  { id: "weblive", label: "WebLive" },
];

const LISTING_FILTERS: { id: "all" | VendorListing; label: string }[] = [
  { id: "all", label: "All listings" },
  { id: "business", label: "Business" },
  { id: "freelancer", label: "Freelancer" },
  { id: "both", label: "Both" },
];

export default function VendorsScreen() {
  const { state, live, refreshVendors, vendorsSync } = useApp();
  const you = live ?? { lat: 17.4126, lng: 78.4483 };
  const [kind, setKind] = useState<"all" | VendorKind>("all");
  const [listing, setListing] = useState<"all" | VendorListing>("all");

  const camartes = state.vendors.filter((v) => v.source === "camartes");
  const businesses = camartes.filter((v) => v.listing === "business" || v.listing === "both").length;
  const freelancers = camartes.filter((v) => v.listing === "freelancer" || v.listing === "both").length;

  const list = useMemo(() => {
    return state.vendors
      .filter((v) => kind === "all" || v.kind === kind)
      .filter((v) => listing === "all" || v.listing === listing || (listing !== "both" && v.listing === "both"))
      .map((v) => ({ ...v, km: haversineKm(you, v.geo) }))
      .sort((a, b) => a.km - b.km);
  }, [state.vendors, kind, listing, you.lat, you.lng]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Title>{t(state.language, "vendors")}</Title>
      <Muted>
        Live businesses and freelancers listed on camartes.com, plus Hyderabad walk-ins not on the platform yet.
      </Muted>
      <Card>
        <Text style={styles.body}>
          {camartes.length} on Camartes · {businesses} businesses · {freelancers} freelancers
        </Text>
        <Muted>
          {vendorsSync.loading
            ? "Refreshing from camartes.com…"
            : vendorsSync.live
              ? "Synced live from camartes.com"
              : vendorsSync.error ?? "Using saved Camartes catalog"}
        </Muted>
        <Button
          label={vendorsSync.loading ? "Refreshing…" : "Refresh from camartes.com"}
          variant="outline"
          onPress={() => void refreshVendors()}
        />
        {vendorsSync.loading ? <ActivityIndicator color={colors.primary} /> : null}
      </Card>
      <MiniMap
        markers={[
          { id: "you", label: "You", color: colors.primary, point: you },
          ...list.slice(0, 10).map((v) => ({
            id: v.id,
            label: v.name.split(" ")[0],
            color: v.source === "camartes" ? colors.orange : colors.ink,
            point: v.geo,
          })),
        ]}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {LISTING_FILTERS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setListing(f.id)}
            style={[styles.chip, listing === f.id && styles.chipOn]}
          >
            <Text style={[styles.chipTxt, listing === f.id && styles.chipTxtOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {KIND_FILTERS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setKind(f.id)}
            style={[styles.chip, kind === f.id && styles.chipOn]}
          >
            <Text style={[styles.chipTxt, kind === f.id && styles.chipTxtOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {list.length === 0 ? (
        <Card>
          <Muted>No vendors match this filter.</Muted>
        </Card>
      ) : null}
      {list.map((v) => (
        <Pressable key={v.id} onPress={() => router.push(`/(app)/vendors/${v.id}`)}>
          <Card>
            <Text style={styles.body}>{v.name}</Text>
            <Muted>
              {LISTING_LABEL[v.listing]} · {VENDOR_KIND_LABEL[v.kind]} · {v.city} · {formatKm(v.km)}
            </Muted>
            <Muted>
              {v.source === "camartes" ? "Listed on camartes.com" : "Field walk-in (not on Camartes yet)"}
              {v.kycVerified ? " · KYC" : ""}
              {v.partnerCode ? ` · ${v.partnerCode}` : ""}
            </Muted>
            {v.serviceTypes?.length ? (
              <Muted>{v.serviceTypes.map((s) => SERVICE_TYPE_LABEL[s] ?? s).join(" · ")}</Muted>
            ) : null}
          </Card>
        </Pressable>
      ))}
      <Button label="Open market tasks" variant="ghost" onPress={() => router.push("/(app)/tasks")} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10, backgroundColor: colors.bg, paddingBottom: 48 },
  body: { fontSize: 16, fontWeight: "800", color: colors.ink },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.peach,
  },
  chipOn: { backgroundColor: colors.primary },
  chipTxt: { fontWeight: "700", color: colors.ink, fontSize: 12 },
  chipTxtOn: { color: "#fff" },
});
