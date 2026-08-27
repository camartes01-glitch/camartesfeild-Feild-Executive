import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { Button, Card, Muted, Title } from "@/components/ui";
import { MiniMap } from "@/components/mini-map";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { SERVICE_TYPE_LABEL } from "@/lib/camartes-api";
import {
  BUSINESS_SERVICES,
  FREELANCER_SERVICES,
  vendorMatchesService,
} from "@/lib/camartes-services";
import { formatKm, haversineKm } from "@/lib/geo";
import { LISTING_LABEL, VENDOR_KIND_LABEL } from "@/lib/vendors-seed";
import { t } from "@/lib/i18n";
import type { VendorKind } from "@/lib/types";

export default function VendorsScreen() {
  const { state, live, refreshVendors, vendorsSync } = useApp();
  const you = live ?? { lat: 17.4126, lng: 78.4483 };
  const [service, setService] = useState<"all" | VendorKind>("all");

  const camartes = state.vendors.filter((v) => v.source === "camartes");
  const businesses = camartes.filter((v) => v.listing === "business" || v.listing === "both").length;
  const freelancers = camartes.filter((v) => v.listing === "freelancer" || v.listing === "both").length;

  const list = useMemo(() => {
    return state.vendors
      .filter((v) => service === "all" || vendorMatchesService(v.serviceTypes, v.kind, service))
      .map((v) => ({ ...v, km: haversineKm(you, v.geo) }))
      .sort((a, b) => a.km - b.km);
  }, [state.vendors, service, you.lat, you.lng]);

  const selectedMeta = [...FREELANCER_SERVICES, ...BUSINESS_SERVICES].find((s) => s.id === service);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Title>{t(state.language, "vendors")}</Title>
      <Muted>
        Categories match the Services tab on camartes.com — seven freelancer services and seven business services.
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
        {selectedMeta ? <Muted>{selectedMeta.description}</Muted> : null}
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
      <Muted>Freelancers</Muted>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Pressable onPress={() => setService("all")} style={[styles.chip, service === "all" && styles.chipOn]}>
          <Text style={[styles.chipTxt, service === "all" && styles.chipTxtOn]}>All</Text>
        </Pressable>
        {FREELANCER_SERVICES.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setService(f.id)}
            style={[styles.chip, service === f.id && styles.chipOn]}
          >
            <Text style={[styles.chipTxt, service === f.id && styles.chipTxtOn]}>{f.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Muted>Businesses</Muted>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {BUSINESS_SERVICES.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setService(f.id)}
            style={[styles.chip, service === f.id && styles.chipOn]}
          >
            <Text style={[styles.chipTxt, service === f.id && styles.chipTxtOn]}>{f.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {list.length === 0 ? (
        <Card>
          <Muted>
            No vendors in this Services category yet. Log a walk-in and onboard them onto camartes.com.
          </Muted>
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
