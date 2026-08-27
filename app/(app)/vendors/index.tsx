import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, Muted, Title } from "@/components/ui";
import { MiniMap } from "@/components/mini-map";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { formatKm, haversineKm } from "@/lib/geo";
import { VENDOR_KIND_LABEL } from "@/lib/vendors-seed";
import { t } from "@/lib/i18n";
import type { VendorKind } from "@/lib/types";

const FILTERS: { id: "all" | VendorKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "photography_studio", label: "Studio" },
  { id: "freelance_photographer", label: "Photo" },
  { id: "videographer", label: "Video" },
  { id: "album_designer", label: "Album" },
  { id: "video_editor", label: "Editor" },
  { id: "led_wall", label: "LED" },
  { id: "weblive", label: "WebLive" },
];

export default function VendorsScreen() {
  const { state, live } = useApp();
  const you = live ?? { lat: 17.4126, lng: 78.4483 };
  const [kind, setKind] = useState<"all" | VendorKind>("all");

  const list = useMemo(() => {
    return state.vendors
      .filter((v) => kind === "all" || v.kind === kind)
      .map((v) => ({ ...v, km: haversineKm(you, v.geo) }))
      .sort((a, b) => a.km - b.km);
  }, [state.vendors, kind, you.lat, you.lng]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Title>{t(state.language, "vendors")}</Title>
      <Muted>
        Visit nearby studios, freelancers, editors, LED walls and WebLive partners. Market Camartes and onboard them onto the platform.
      </Muted>
      <MiniMap
        markers={[
          { id: "you", label: "You", color: colors.primary, point: you },
          ...list.slice(0, 8).map((v) => ({
            id: v.id,
            label: v.name.split(" ")[0],
            color: colors.orange,
            point: v.geo,
          })),
        ]}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setKind(f.id)}
            style={[styles.chip, kind === f.id && styles.chipOn]}
          >
            <Text style={[styles.chipTxt, kind === f.id && styles.chipTxtOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {list.map((v) => (
        <Pressable key={v.id} onPress={() => router.push(`/(app)/vendors/${v.id}`)}>
          <Card>
            <Text style={styles.body}>{v.name}</Text>
            <Muted>
              {VENDOR_KIND_LABEL[v.kind]} · {v.area} · {formatKm(v.km)} · {v.status.replace("_", " ")}
            </Muted>
            {v.partnerCode ? <Muted>Partner {v.partnerCode}</Muted> : null}
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
