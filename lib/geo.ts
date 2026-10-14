import type { GeoPoint } from "@/lib/types";

const EARTH_KM = 6371;

/** A fix older than this is not "live": the phone may have lost the signal since. */
export const GPS_STALE_MS = 2 * 60_000;

export function isStaleFix(fix: { at: string } | null | undefined, now = Date.now()) {
  return !fix || now - Date.parse(fix.at) > GPS_STALE_MS;
}

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

export type NavTarget = { lat?: number | null; lng?: number | null; address?: string | null };

/**
 * Directions to the stop's real coordinates (or its address when there are none). The current position is
 * optional: without a GPS fix the maps app starts from wherever it locates the phone. Null = nowhere to go.
 */
export function navigationUrl(origin: GeoPoint | null, dest: NavTarget | null | undefined): string | null {
  if (!dest) return null;
  const hasCoords = Number.isFinite(dest.lat) && Number.isFinite(dest.lng) && !(dest.lat === 0 && dest.lng === 0);
  const address = dest.address?.trim();
  const target = hasCoords ? `${dest.lat},${dest.lng}` : address ? encodeURIComponent(address) : null;
  if (!target) return null;
  const from = origin ? `&origin=${origin.lat},${origin.lng}` : "";
  return `https://www.google.com/maps/dir/?api=1${from}&destination=${target}&travelmode=driving`;
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
