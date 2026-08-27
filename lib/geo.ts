import type { GeoPoint } from "@/lib/types";

const EARTH_KM = 6371;

export function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(a: GeoPoint, b: GeoPoint) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatKm(km: number) {
  if (!Number.isFinite(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function formatCoord(n: number, digits = 5) {
  return n.toFixed(digits);
}

export function mapsDirUrl(origin: GeoPoint, dest: GeoPoint) {
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}&travelmode=driving`;
}

export function mapsPinUrl(p: GeoPoint) {
  return `https://www.google.com/maps?q=${p.lat},${p.lng}`;
}

export function pathKm(pings: GeoPoint[]) {
  let total = 0;
  for (let i = 1; i < pings.length; i++) {
    total += haversineKm(pings[i - 1], pings[i]);
  }
  return total;
}

export function nearestHubKm(point: GeoPoint, hubs: GeoPoint[]) {
  return Math.min(...hubs.map((h) => haversineKm(point, h)));
}

export const GEOFENCE_KM = 0.25;
