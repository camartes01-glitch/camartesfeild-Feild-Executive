import { useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { colors } from "@/constants/theme";
import type { GeoPoint } from "@/lib/types";

export type MapMarker = {
  id: string;
  label: string;
  color: string;
  point: GeoPoint;
  subtitle?: string;
  onPress?: () => void;
};

type RenderNode =
  | { type: "single"; marker: MapMarker; x: number; y: number }
  | { type: "cluster"; items: MapMarker[]; x: number; y: number };

const CLUSTER_DISTANCE_PX = 28;

export function MiniMap({
  markers,
  height = 180,
  selectedId: controlledSelectedId,
  onSelectMarker,
  showLabels = false,
  emptyMessage,
  paths = [],
}: {
  paths?: { id: string; color: string; points: GeoPoint[] }[];
  markers: MapMarker[];
  height?: number;
  selectedId?: string | null;
  onSelectMarker?: (id: string | null) => void;
  showLabels?: boolean;
  emptyMessage?: string;
}) {
  const [size, setSize] = useState({ w: 0, h: height });
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);

  const activeSelectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;

  // Filter only markers with valid real coordinates
  const validMarkers = useMemo(
    () =>
      markers.filter(
        (m) =>
          m.point &&
          typeof m.point.lat === "number" &&
          typeof m.point.lng === "number" &&
          !isNaN(m.point.lat) &&
          !isNaN(m.point.lng) &&
          (m.point.lat !== 0 || m.point.lng !== 0),
      ),
    [markers],
  );

  const selectedMarker = useMemo(
    () => validMarkers.find((m) => m.id === activeSelectedId) ?? null,
    [validMarkers, activeSelectedId],
  );

  const projected = useMemo(() => {
    if (validMarkers.length === 0 || size.w === 0) return { nodes: [] as RenderNode[], lines: [] as { id: string; color: string; pts: string }[] };

    const pathPoints = paths.flatMap((p) => p.points);
    const lats = [...validMarkers.map((m) => m.point.lat), ...pathPoints.map((p) => p.lat)];
    const lngs = [...validMarkers.map((m) => m.point.lng), ...pathPoints.map((p) => p.lng)];
    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);
    let minLng = Math.min(...lngs);
    let maxLng = Math.max(...lngs);

    if (maxLat - minLat < 0.005) {
      minLat -= 0.005;
      maxLat += 0.005;
    }
    if (maxLng - minLng < 0.005) {
      minLng -= 0.005;
      maxLng += 0.005;
    }

    const paddingRatio = 0.14;
    const latSpan = (maxLat - minLat) * paddingRatio;
    const lngSpan = (maxLng - minLng) * paddingRatio;
    minLat -= latSpan;
    maxLat += latSpan;
    minLng -= lngSpan;
    maxLng += lngSpan;

    const toX = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * size.w;
    const toY = (lat: number) => (1 - (lat - minLat) / (maxLat - minLat)) * size.h;

    const raw = validMarkers.map((m) => ({
      marker: m,
      px: toX(m.point.lng),
      py: toY(m.point.lat),
    }));

    const clusters: RenderNode[] = [];
    const used = new Set<number>();

    for (let i = 0; i < raw.length; i++) {
      if (used.has(i)) continue;
      used.add(i);
      const group = [raw[i]];

      for (let j = i + 1; j < raw.length; j++) {
        if (used.has(j)) continue;
        const dx = raw[i].px - raw[j].px;
        const dy = raw[i].py - raw[j].py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CLUSTER_DISTANCE_PX) {
          used.add(j);
          group.push(raw[j]);
        }
      }

      const avgX = group.reduce((sum, item) => sum + item.px, 0) / group.length;
      const avgY = group.reduce((sum, item) => sum + item.py, 0) / group.length;

      if (group.length === 1) {
        clusters.push({ type: "single", marker: group[0].marker, x: avgX, y: avgY });
      } else {
        clusters.push({
          type: "cluster",
          items: group.map((g) => g.marker),
          x: avgX,
          y: avgY,
        });
      }
    }

    const lines = paths
      .filter((p) => p.points.length > 1)
      .map((p) => ({ id: p.id, color: p.color, pts: p.points.map((pt) => `${toX(pt.lng).toFixed(1)},${toY(pt.lat).toFixed(1)}`).join(" ") }));
    return { nodes: clusters, lines };
  }, [validMarkers, paths, size.w, size.h]);
  const nodes = projected.nodes;

  function onLayout(e: LayoutChangeEvent) {
    const { width, height: h } = e.nativeEvent.layout;
    setSize({ w: width, h: h || height });
  }

  function handleSelect(id: string | null) {
    if (controlledSelectedId === undefined) {
      setInternalSelectedId(id);
    }
    if (onSelectMarker) {
      onSelectMarker(id);
    }
  }

  if (validMarkers.length === 0) {
    return (
      <View style={[styles.wrap, styles.emptyWrap, { height }]}>
        <Text style={styles.emptyText}>{emptyMessage ?? "No real GPS coordinates available"}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]} onLayout={onLayout}>
      {size.w > 0 && projected.lines.length ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          {projected.lines.map((line) => (
            <Polyline key={line.id} points={line.pts} fill="none" stroke={line.color} strokeWidth={2.5} strokeOpacity={0.75} />
          ))}
        </Svg>
      ) : null}
      {size.w > 0
        ? nodes.map((node, index) => {
            if (node.type === "single") {
              const { marker, x, y } = node;
              const isSelected = activeSelectedId === marker.id;

              return (
                <Pressable
                  key={marker.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Map pin: ${marker.label}`}
                  onPress={() => {
                    const nextId = isSelected ? null : marker.id;
                    handleSelect(nextId);
                    if (marker.onPress) marker.onPress();
                  }}
                  style={[
                    styles.pin,
                    {
                      left: x,
                      top: y,
                      backgroundColor: marker.color || colors.primary,
                      transform: [{ scale: isSelected ? 1.5 : 1 }],
                      zIndex: isSelected ? 99 : index + 10,
                      borderColor: isSelected ? colors.ink : "#fff",
                    },
                  ]}
                >
                  {showLabels || isSelected ? (
                    <Text style={styles.pinLabel} numberOfLines={1}>
                      {marker.label}
                    </Text>
                  ) : null}
                </Pressable>
              );
            }

            // Cluster node
            const clusterId = `cluster-${index}`;
            const count = node.items.length;
            const primaryColor = node.items[0].color || colors.primary;
            const containsSelected = node.items.some((it) => it.id === activeSelectedId);

            return (
              <Pressable
                key={clusterId}
                accessibilityRole="button"
                accessibilityLabel={`Cluster with ${count} items`}
                onPress={() => {
                  const first = node.items[0];
                  handleSelect(first.id);
                  if (first.onPress) first.onPress();
                }}
                style={[
                  styles.clusterPin,
                  {
                    left: node.x,
                    top: node.y,
                    backgroundColor: primaryColor,
                    zIndex: containsSelected ? 95 : 50 + index,
                    transform: [{ scale: containsSelected ? 1.25 : 1 }],
                    borderColor: containsSelected ? colors.ink : "#fff",
                  },
                ]}
              >
                <Text style={styles.clusterText}>{count}</Text>
              </Pressable>
            );
          })
        : null}

      {selectedMarker ? (
        <View style={styles.callout}>
          <View style={{ flex: 1 }}>
            <Text style={styles.calloutTitle} numberOfLines={1}>
              {selectedMarker.label}
            </Text>
            {selectedMarker.subtitle ? (
              <Text style={styles.calloutSub} numberOfLines={1}>
                {selectedMarker.subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close callout"
            onPress={() => handleSelect(null)}
            style={styles.calloutClose}
          >
            <Text style={styles.calloutCloseText}>✕</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 180,
    borderRadius: 12,
    backgroundColor: "#FFF2E6",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.peachBorder,
    position: "relative",
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: colors.cream,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    textAlign: "center",
  },
  pin: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    marginTop: -7,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  clusterPin: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
    marginLeft: -13,
    marginTop: -13,
    borderWidth: 2.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  clusterText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
  },
  pinLabel: {
    position: "absolute",
    top: -20,
    left: -32,
    width: 78,
    fontSize: 9,
    color: colors.ink,
    fontWeight: "800",
    textAlign: "center",
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: colors.peachBorder,
    overflow: "hidden",
  },
  callout: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.peachBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  calloutTitle: {
    fontWeight: "800",
    fontSize: 13,
    color: colors.ink,
  },
  calloutSub: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 1,
  },
  calloutClose: {
    padding: 4,
    marginLeft: 8,
  },
  calloutCloseText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: "800",
  },
});

