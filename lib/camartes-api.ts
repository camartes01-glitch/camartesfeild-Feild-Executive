import type { GeoPoint, Vendor, VendorListing } from "@/lib/types";
import snapshot from "@/lib/camartes-raw-snapshot.json";
import {
  CAMARTES_SERVICE_IDS,
  SERVICE_TYPE_LABEL,
  normalizeServiceId,
  normalizeServiceIds,
  primaryService,
} from "@/lib/camartes-services";

export { SERVICE_TYPE_LABEL };
export const CAMARTES_API = "https://camartes-backend.onrender.com";
export const CAMARTES_SITE = "https://www.camartes.com";

const SEARCH_TYPES = [...CAMARTES_SERVICE_IDS];

const CITY_GEO: Record<string, GeoPoint> = {
  hyderabad: { lat: 17.385, lng: 78.4867 },
  secunderabad: { lat: 17.4399, lng: 78.4983 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  visakhapatnam: { lat: 17.6868, lng: 83.2185 },
  vizag: { lat: 17.6868, lng: 83.2185 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  pune: { lat: 18.5204, lng: 73.8567 },
  delhi: { lat: 28.6139, lng: 77.209 },
  vijayawada: { lat: 16.5062, lng: 80.648 },
};

type RawStore = {
  store_id?: string | null;
  store_name?: string;
  city?: string;
  address?: string;
  contact?: string;
  latitude?: number | null;
  longitude?: number | null;
  kyc_verified?: boolean;
  camera_count?: number;
  total_equipment?: number;
};

type RawProfile = {
  id?: string;
  user_id?: string;
  name?: string | null;
  full_name?: string | null;
  phone?: string | null;
  contact_number?: string | null;
  city?: string | null;
  full_address?: string | null;
  is_business?: boolean | null;
  is_freelancer?: boolean | null;
  kyc_verified?: boolean | null;
  service_profiles?: Record<string, Record<string, unknown>> | null;
  camera_rental_access?: boolean | null;
};

type RawSearchHit = {
  user_id?: string;
  service_type?: string;
  service_category?: string;
  display_name?: string;
  city?: string;
  contact_phone?: string;
};

type RawSnapshot = {
  fetchedAt: string;
  stores: RawStore[];
  profiles: RawProfile[];
  searchHits?: RawSearchHit[];
};

const SNAPSHOT = snapshot as RawSnapshot;

function cityGeo(city: string | null | undefined): GeoPoint {
  const key = (city ?? "Hyderabad").trim().toLowerCase();
  return CITY_GEO[key] ?? CITY_GEO.hyderabad;
}

function jitter(id: string, geo: GeoPoint): GeoPoint {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const dlat = ((h % 90) - 45) * 0.00035;
  const dlng = (((h >>> 8) % 90) - 45) * 0.00035;
  return { lat: geo.lat + dlat, lng: geo.lng + dlng };
}

export function formatVendorPhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91 ${digits.slice(1)}`;
  if (digits.length === 10) return `+91 ${digits}`;
  return `+${digits}`;
}

function areaFromAddress(address: string, city: string): string {
  if (!address) return city;
  const parts = address
    .split(/[,/]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || city;
}

function listingOf(profile: RawProfile | undefined, hasStore: boolean): VendorListing {
  const biz = !!profile?.is_business || hasStore;
  const free = !!profile?.is_freelancer;
  if (biz && free) return "both";
  if (biz) return "business";
  return "freelancer";
}

function primaryKind(services: string[], listing: VendorListing) {
  return primaryService(services, listing);
}

function slugId(store: RawStore): string {
  if (store.store_id) return store.store_id;
  const slug = (store.store_name ?? "store")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `camartes-store-${slug || "unknown"}`;
}

function buildNotes(profile: RawProfile | undefined, store: RawStore | undefined, services: string[]): string {
  const bits: string[] = [];
  if (store) {
    bits.push(
      `Listed rental store on camartes.com · ${store.camera_count ?? 0} cameras · ${store.total_equipment ?? 0} kit items.`,
    );
  }
  const sp = profile?.service_profiles ?? {};
  for (const type of services) {
    const row = sp[type];
    if (!row) continue;
    const tagline = String(row.tagline ?? "").trim();
    const years = row.years_experience;
    const label = SERVICE_TYPE_LABEL[type] ?? type;
    const extra = [tagline, typeof years === "number" && years > 0 ? `${years} yrs` : ""]
      .filter(Boolean)
      .join(" · ");
    bits.push(extra ? `${label}: ${extra}` : `${label} listed on Camartes.`);
  }
  if (profile?.kyc_verified) bits.push("KYC verified on Camartes.");
  return bits.join(" ") || "Listed on camartes.com.";
}

export function mapCamartesCatalog(
  stores: RawStore[],
  profiles: RawProfile[],
  searchHits: RawSearchHit[] = [],
): Vendor[] {
  const byId = new Map<string, RawProfile>();
  for (const p of profiles) {
    const id = p.id || p.user_id;
    if (id) byId.set(id, p);
  }

  const extraServices = new Map<string, Set<string>>();
  const extraCategory = new Map<string, string>();
  for (const hit of searchHits) {
    const id = hit.user_id;
    if (!id) continue;
    if (!extraServices.has(id)) extraServices.set(id, new Set());
    if (hit.service_type) {
      const n = normalizeServiceId(hit.service_type) ?? hit.service_type;
      extraServices.get(id)!.add(n);
    }
    if (hit.service_category) extraCategory.set(id, hit.service_category);
  }

  const storeByUser = new Map<string, RawStore>();
  const orphanStores: RawStore[] = [];
  for (const s of stores) {
    if (s.store_id) storeByUser.set(s.store_id, s);
    else orphanStores.push(s);
  }

  const ids = new Set<string>([...byId.keys(), ...storeByUser.keys(), ...extraServices.keys()]);
  const vendors: Vendor[] = [];

  for (const id of ids) {
    const profile = byId.get(id);
    const store = storeByUser.get(id);
    const services = new Set<string>(
      Object.keys(profile?.service_profiles ?? {})
        .map((k) => normalizeServiceId(k) ?? k)
        .filter(Boolean),
    );
    for (const s of extraServices.get(id) ?? []) services.add(s);
    if (store) services.add("camera_rental");

    const name = (profile?.name || profile?.full_name || store?.store_name || "").trim();
    if (!name) continue;

    const city = (store?.city || profile?.city || "Hyderabad").trim() || "Hyderabad";
    const phone =
      formatVendorPhone(store?.contact) ||
      formatVendorPhone(profile?.contact_number) ||
      formatVendorPhone(profile?.phone);
    const address = (profile?.full_address || store?.address || city).trim();
    let listing = listingOf(profile, !!store);
    const cat = extraCategory.get(id);
    if (cat === "business" && listing === "freelancer") listing = "both";
    if (cat === "freelancer" && listing === "business") listing = "both";
    const serviceTypes = normalizeServiceIds([...services]);
    const hasFix = !!(store?.latitude && store?.longitude);
    const geo = hasFix
      ? { lat: store!.latitude as number, lng: store!.longitude as number }
      : jitter(id, cityGeo(city));

    vendors.push({
      id,
      kind: primaryKind(serviceTypes, listing),
      listing,
      source: "camartes",
      name,
      contact: name,
      phone: phone || "—",
      address,
      area: areaFromAddress(address, city),
      city,
      geo,
      status: "prospect",
      interest: "to_meet",
      onboarding: false,
      notes: buildNotes(profile, store, serviceTypes),
      serviceTypes,
      kycVerified: !!(profile?.kyc_verified || store?.kyc_verified),
      cameraCount: store?.camera_count,
      equipmentCount: store?.total_equipment,
      profileUrl: `${CAMARTES_SITE}/provider/${id}`,
      geoApprox: !hasFix,
    });
  }

  for (const store of orphanStores) {
    const id = slugId(store);
    const name = (store.store_name ?? "Rental store").trim();
    const city = (store.city ?? "Hyderabad").trim();
    vendors.push({
      id,
      kind: "camera_rental",
      listing: "business",
      source: "camartes",
      name,
      contact: name,
      phone: formatVendorPhone(store.contact) || "—",
      address: store.address || city,
      area: city,
      city,
      geo: jitter(id, cityGeo(city)),
      status: "prospect",
      interest: "to_meet",
      onboarding: false,
      notes: buildNotes(undefined, store, ["camera_rental"]),
      serviceTypes: ["camera_rental"],
      kycVerified: !!store.kyc_verified,
      cameraCount: store.camera_count,
      equipmentCount: store.total_equipment,
      geoApprox: true,
    });
  }

  return vendors.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
}

export const CAMARTES_VENDOR_SNAPSHOT = mapCamartesCatalog(
  SNAPSHOT.stores,
  SNAPSHOT.profiles,
  SNAPSHOT.searchHits ?? [],
);
export const CAMARTES_SNAPSHOT_AT = SNAPSHOT.fetchedAt;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${CAMARTES_API}${path}`);
  if (!res.ok) throw new Error(`Camartes ${path} ${res.status}`);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${CAMARTES_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Camartes ${path} ${res.status}`);
  return (await res.json()) as T;
}

function userIdsFromDebugRows(rows: string[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const m = row.match(/^user_(user_[a-zA-Z0-9]+)_/);
    if (m) ids.add(m[1]);
  }
  return [...ids];
}

export async function fetchCamartesVendors(): Promise<{
  vendors: Vendor[];
  fetchedAt: string;
  live: boolean;
}> {
  try {
    const [storesRes, countRes] = await Promise.all([
      getJson<{ stores?: RawStore[] }>("/api/browse/stores"),
      getJson<{ rows?: string[] }>("/api/debug/service-profiles-count"),
    ]);
    const stores = storesRes.stores ?? [];
    const ids = new Set(userIdsFromDebugRows(countRes.rows ?? []));
    for (const s of stores) if (s.store_id) ids.add(s.store_id);

    const extra = await Promise.all(
      SEARCH_TYPES.map(async (service_type) => {
        try {
          const rows = await postJson<RawSearchHit[]>("/api/providers/search", { service_type });
          return (rows ?? []).map((row) => ({
            ...row,
            service_type: row.service_type || service_type,
            user_id: row.user_id || (row as RawSearchHit & { provider_id?: string; id?: string }).provider_id || (row as { id?: string }).id,
          }));
        } catch {
          return [] as RawSearchHit[];
        }
      }),
    );
    const searchHits = extra.flat();
    for (const hit of searchHits) {
      if (hit.user_id) ids.add(hit.user_id);
    }

    const profiles = (
      await Promise.all(
        [...ids].map(async (id) => {
          try {
            return await getJson<RawProfile>(`/api/providers/${id}`);
          } catch {
            return null;
          }
        }),
      )
    ).filter((p): p is RawProfile => !!p && !("detail" in p));

    const vendors = mapCamartesCatalog(stores, profiles, searchHits);
    if (!vendors.length) {
      return { vendors: CAMARTES_VENDOR_SNAPSHOT, fetchedAt: CAMARTES_SNAPSHOT_AT, live: false };
    }
    return { vendors, fetchedAt: new Date().toISOString(), live: true };
  } catch {
    return { vendors: CAMARTES_VENDOR_SNAPSHOT, fetchedAt: CAMARTES_SNAPSHOT_AT, live: false };
  }
}

export function overlayVendorState(fresh: Vendor[], previous: Vendor[]): Vendor[] {
  const prev = new Map(previous.map((v) => [v.id, v]));
  const mapped = fresh.map((v) => {
    const old = prev.get(v.id);
    if (!old) return v;
    return {
      ...v,
      status: old.status,
      partnerCode: old.partnerCode,
      photos: old.photos,
      notes: old.notes || v.notes,
      onboarding: old.onboarding || v.onboarding,
      interest: old.interest ?? v.interest,
      lastVisitedAt: old.lastVisitedAt ?? v.lastVisitedAt,
      nextMeetingAt: old.nextMeetingAt ?? v.nextMeetingAt,
      nextMeetingNote: old.nextMeetingNote ?? v.nextMeetingNote,
      gstin: old.gstin ?? v.gstin,
      decisionMaker: old.decisionMaker ?? v.decisionMaker,
      competitor: old.competitor ?? v.competitor,
      ownedKit: old.ownedKit ?? v.ownedKit,
      nextShootDate: old.nextShootDate ?? v.nextShootDate,
      declineReason: old.declineReason ?? v.declineReason,
    };
  });
  const extras = previous
    .filter((v) => v.source !== "camartes" && !mapped.some((m) => m.id === v.id))
    .map((v) => {
      const serviceTypes = normalizeServiceIds([...(v.serviceTypes ?? []), v.kind]);
      return {
        ...v,
        serviceTypes,
        kind: primaryService(serviceTypes, v.listing),
      };
    });
  return [...mapped, ...extras];
}
