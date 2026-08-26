"use client";

import { useEffect, useRef } from "react";
import type { GeoPoint } from "@/lib/types";

type Marker = { id: string; label: string; color: string; point: GeoPoint };

export function FieldMap({
  center,
  markers,
  className,
}: {
  center: GeoPoint;
  markers: Marker[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;

    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !el) return;

      if (!mapRef.current) {
        mapRef.current = L.map(el, { zoomControl: false, attributionControl: true }).setView(
          [center.lat, center.lng],
          13,
        );
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker) map.removeLayer(layer);
      });

      const icon = (color: string) =>
        L.divIcon({
          className: "",
          html: `<div style="width:14px;height:14px;border-radius:999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px ${color}"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

      const bounds: [number, number][] = [];
      for (const m of markers) {
        L.marker([m.point.lat, m.point.lng], { icon: icon(m.color) })
          .addTo(map)
          .bindTooltip(m.label, { direction: "top" });
        bounds.push([m.point.lat, m.point.lng]);
      }
      map.setView([center.lat, center.lng], 13);
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
      }
    })();

    return () => {
      cancelled = true;
    };
    // markers identity is unstable from callers; key off serialized coords
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    center.lat,
    center.lng,
    markers.map((m) => `${m.id}:${m.point.lat}:${m.point.lng}`).join("|"),
  ]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={ref} className={className ?? "h-56 w-full overflow-hidden rounded-xl"} />;
}
