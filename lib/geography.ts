import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ApiResult } from "@/lib/ops-api";

/** Server shape of one administrative unit (state, district, mandal, village, town, …). */
export type GeoUnit = {
  id: string;
  level: string;
  levelLabel: string;
  subtype?: string | null;
  code?: string | null;
  name: string;
  localName?: string | null;
  parentId?: string | null;
  stateId?: string | null;
  districtId?: string | null;
  subdistrictId?: string | null;
  stateName?: string | null;
  districtName?: string | null;
  subdistrictName?: string | null;
  hierarchy: string;
  status?: string;
  matchedAlias?: string | null;
  distanceKm?: number;
  via?: string;
};

export type GeoPage = { items: GeoUnit[]; nextOffset: number | null };
export type PincodeOffice = {
  pincode: string;
  office: string;
  officeType?: string | null;
  match: string;
  state?: GeoUnit | null;
  district?: GeoUnit | null;
  subdistrict?: GeoUnit | null;
  sourceDistrict?: string | null;
  sourceState?: string | null;
};

export const GEO = "/api/geography";
type Getter = <T>(path: string) => Promise<ApiResult<T>>;

// ── Device cache ────────────────────────────────────────────────────────────
// Only what this employee used or browsed is kept: never a national village list.
const MAX_LISTS = 60;
const MAX_RECENT = 12;

function key(owner: string, kind: string) {
  return `geo:v1:${owner}:${kind}`;
}

async function read<T>(k: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(k: string, value: unknown) {
  void AsyncStorage.setItem(k, JSON.stringify(value)).catch(() => undefined);
}

type ListCache = Record<string, { at: number; page: GeoPage }>;

export async function cachedGet(owner: string, get: Getter, path: string): Promise<{ page: GeoPage | null; offline: boolean; error?: string }> {
  const res = await get<GeoPage>(path);
  const k = key(owner, "lists");
  if (res.ok) {
    const all = await read<ListCache>(k, {});
    all[path] = { at: Date.now(), page: res.body };
    const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
    for (const old of keys.slice(MAX_LISTS)) delete all[old];
    write(k, all);
    return { page: res.body, offline: false };
  }
  const all = await read<ListCache>(k, {});
  const hit = all[path];
  if (hit) return { page: hit.page, offline: true };
  return { page: null, offline: res.status === 0, error: res.message };
}

export async function recentLocations(owner: string): Promise<GeoUnit[]> {
  return read<GeoUnit[]>(key(owner, "recent"), []);
}

export async function rememberLocation(owner: string, unit: GeoUnit) {
  const list = (await recentLocations(owner)).filter((u) => u.id !== unit.id);
  write(key(owner, "recent"), [unit, ...list].slice(0, MAX_RECENT));
}

export async function recentSearches(owner: string): Promise<string[]> {
  return read<string[]>(key(owner, "searches"), []);
}

export async function rememberSearch(owner: string, q: string) {
  const t = q.trim();
  if (t.length < 2) return;
  const list = (await recentSearches(owner)).filter((s) => s.toLowerCase() !== t.toLowerCase());
  write(key(owner, "searches"), [t, ...list].slice(0, 8));
}

/** Offline search: whatever this device has seen (recent picks + cached lists), matched loosely. */
export async function searchOffline(owner: string, q: string): Promise<GeoUnit[]> {
  const needle = normalise(q);
  if (!needle) return [];
  const pool = new Map<string, GeoUnit>();
  for (const u of await recentLocations(owner)) pool.set(u.id, u);
  const lists = await read<ListCache>(key(owner, "lists"), {});
  for (const { page } of Object.values(lists)) for (const u of page.items) pool.set(u.id, u);
  return [...pool.values()]
    .filter((u) => normalise(u.name).includes(needle) || (u.localName ? normalise(u.localName).includes(needle) : false))
    .slice(0, 30);
}

export function normalise(s: string) {
  return s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s.,'’\-()/]+/g, "");
}

export function clearGeographyCache(owner: string) {
  void AsyncStorage.multiRemove([key(owner, "lists"), key(owner, "recent"), key(owner, "searches"), key(owner, "me"), key(owner, "nearby")]).catch(() => undefined);
}

// ── Hierarchy browsing ──────────────────────────────────────────────────────

export type BrowseStep = { level: "ROOT" | "STATE" | "DISTRICT" | "SUBDISTRICT"; unit?: GeoUnit };

/** Endpoint for the children shown under a browse step. */
export function childrenPath(step: BrowseStep, offset: number, tab: "villages" | "towns" | "localBodies" = "villages") {
  const page = `limit=40&offset=${offset}`;
  switch (step.level) {
    case "ROOT":
      return `${GEO}/states-and-uts?limit=100&offset=${offset}`;
    case "STATE":
      return `${GEO}/districts?state_id=${encodeURIComponent(step.unit!.id)}&${page}`;
    case "DISTRICT":
      if (tab === "towns") return `${GEO}/towns?district_id=${encodeURIComponent(step.unit!.id)}&${page}`;
      if (tab === "localBodies") return `${GEO}/local-bodies?district_id=${encodeURIComponent(step.unit!.id)}&${page}`;
      return `${GEO}/subdistricts?district_id=${encodeURIComponent(step.unit!.id)}&${page}`;
    case "SUBDISTRICT":
      if (tab === "towns") return `${GEO}/towns?subdistrict_id=${encodeURIComponent(step.unit!.id)}&${page}`;
      return `${GEO}/villages?subdistrict_id=${encodeURIComponent(step.unit!.id)}&${page}`;
  }
}

export function nextStep(unit: GeoUnit): BrowseStep | null {
  if (unit.level === "STATE" || unit.level === "UNION_TERRITORY") return { level: "STATE", unit };
  if (unit.level === "DISTRICT") return { level: "DISTRICT", unit };
  if (unit.level === "SUBDISTRICT") return { level: "SUBDISTRICT", unit };
  return null;
}

// ── Single cached values (assigned area, last nearby suggestions) ───────────

/** GET a small JSON value; on failure return the last good copy for this employee (offline support). */
export async function cachedValue<T>(owner: string, get: Getter, path: string, kind: "me" | "nearby"): Promise<{ value: T | null; offline: boolean }> {
  const k = key(owner, kind);
  const res = await get<T>(path);
  if (res.ok) {
    write(k, res.body);
    return { value: res.body, offline: false };
  }
  return { value: await read<T | null>(k, null), offline: true };
}

export type MyArea = { readArea: GeoUnit | null; assigned: GeoUnit | null; scopeKind: string };
