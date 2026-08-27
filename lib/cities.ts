import type { GeoPoint } from "@/lib/types";
import { haversineKm } from "@/lib/geo";

export type CityManager = {
  id: string;
  city: string;
  name: string;
  phone: string;
  geo: GeoPoint;
};

/** Camartes city managers — SOS dials whichever city you are nearest to. */
export const CITY_MANAGERS: CityManager[] = [
  {
    id: "cm-hyd",
    city: "Hyderabad",
    name: "Sandeep Rao",
    phone: "+91 40 4855 2100",
    geo: { lat: 17.4126, lng: 78.4483 },
  },
  {
    id: "cm-blr",
    city: "Bengaluru",
    name: "Meera Krishnan",
    phone: "+91 80 4855 2100",
    geo: { lat: 12.9716, lng: 77.5946 },
  },
  {
    id: "cm-che",
    city: "Chennai",
    name: "Karthik Subramanian",
    phone: "+91 44 4855 2100",
    geo: { lat: 13.0827, lng: 80.2707 },
  },
  {
    id: "cm-mum",
    city: "Mumbai",
    name: "Rohit Desai",
    phone: "+91 22 4855 2100",
    geo: { lat: 19.076, lng: 72.8777 },
  },
  {
    id: "cm-del",
    city: "Delhi NCR",
    name: "Ankit Sharma",
    phone: "+91 11 4855 2100",
    geo: { lat: 28.6139, lng: 77.209 },
  },
  {
    id: "cm-pun",
    city: "Pune",
    name: "Neha Kulkarni",
    phone: "+91 20 4855 2100",
    geo: { lat: 18.5204, lng: 73.8567 },
  },
  {
    id: "cm-vja",
    city: "Vijayawada",
    name: "Praveen Naidu",
    phone: "+91 866 485 2100",
    geo: { lat: 16.5062, lng: 80.648 },
  },
];

export function nearestCityManager(point: GeoPoint) {
  let best = CITY_MANAGERS[0];
  let bestKm = haversineKm(point, best.geo);
  for (const m of CITY_MANAGERS.slice(1)) {
    const km = haversineKm(point, m.geo);
    if (km < bestKm) {
      best = m;
      bestKm = km;
    }
  }
  return { manager: best, km: bestKm };
}
