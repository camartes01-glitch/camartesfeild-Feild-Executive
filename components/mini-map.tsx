import { useState } from "react";
import { LayoutChangeEvent, View, Text, StyleSheet } from "react-native";
import { colors } from "@/constants/theme";
import type { GeoPoint } from "@/lib/types";

type Marker = { id: string; label: string; color: string; point: GeoPoint };

export function MiniMap({ markers }: { markers: Marker[] }) {
  const [size, setSize] = useState({ w: 0, h: 180 });
  if (markers.length === 0) return null;
  const lats = markers.map((m) => m.point.lat);
  const lngs = markers.map((m) => m.point.lng);
  const minLat = Math.min(...lats) - 0.01;
  const maxLat = Math.max(...lats) + 0.01;
  const minLng = Math.min(...lngs) - 0.01;
  const maxLng = Math.max(...lngs) + 0.01;
  const x = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * size.w;
  const y = (lat: number) => (1 - (lat - minLat) / (maxLat - minLat)) * size.h;

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  }

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {size.w > 0
        ? markers.map((m) => (
            <View
              key={m.id}
              style={[
                styles.pin,
                { left: x(m.point.lng), top: y(m.point.lat), backgroundColor: m.color },
              ]}
            >
              <Text style={styles.pinLabel}>{m.label}</Text>
            </View>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 180,
    borderRadius: 12,
    backgroundColor: "#FFE2C2",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.peachBorder,
  },
  pin: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    marginTop: -6,
    borderWidth: 2,
    borderColor: "#fff",
  },
  pinLabel: {
    position: "absolute",
    top: 14,
    left: -20,
    width: 80,
    fontSize: 10,
    color: colors.text,
    fontWeight: "600",
  },
});
