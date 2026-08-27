import type { VendorKind, VendorListing } from "@/lib/types";

/** Exact Services tab on camartes.com — vendor category list. */
export type CamartesService = {
  id: VendorKind;
  name: string;
  listing: Exclude<VendorListing, "both">;
  description: string;
};

export const CAMARTES_SERVICES: CamartesService[] = [
  {
    id: "photographer",
    name: "Photographer",
    listing: "freelancer",
    description: "Professional photography services",
  },
  {
    id: "videographer",
    name: "Videographer",
    listing: "freelancer",
    description: "Video recording and production",
  },
  {
    id: "album_designer",
    name: "Album Designer",
    listing: "freelancer",
    description: "Wedding and event album design",
  },
  {
    id: "video_editor",
    name: "Video Editor",
    listing: "freelancer",
    description: "Professional video editing",
  },
  {
    id: "web_live_services",
    name: "Web/Live Services",
    listing: "freelancer",
    description: "Live streaming / WebLive",
  },
  {
    id: "led_wall",
    name: "LED Wall",
    listing: "freelancer",
    description: "LED wall setup and rental",
  },
  {
    id: "fly_cam",
    name: "Fly Cam / Drone",
    listing: "freelancer",
    description: "Aerial photography and videography",
  },
  {
    id: "photography_firm",
    name: "Photography Firm",
    listing: "business",
    description: "Complete photography solutions",
  },
  {
    id: "camera_rental",
    name: "Camera Rental",
    listing: "business",
    description: "Rent professional cameras",
  },
  {
    id: "service_centres",
    name: "Service Centres",
    listing: "business",
    description: "Equipment repair and service",
  },
  {
    id: "outdoor_studios",
    name: "Outdoor Studios",
    listing: "business",
    description: "Outdoor shooting locations",
  },
  {
    id: "editing_studios",
    name: "Editing Studios",
    listing: "business",
    description: "Professional editing suites",
  },
  {
    id: "printing_labs",
    name: "Printing Labs",
    listing: "business",
    description: "Photo printing services",
  },
  {
    id: "software_services",
    name: "Software Services",
    listing: "business",
    description: "Editing software and cloud storage",
  },
];

export const FREELANCER_SERVICES = CAMARTES_SERVICES.filter((s) => s.listing === "freelancer");
export const BUSINESS_SERVICES = CAMARTES_SERVICES.filter((s) => s.listing === "business");
export const CAMARTES_SERVICE_IDS = CAMARTES_SERVICES.map((s) => s.id);

export const SERVICE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CAMARTES_SERVICES.map((s) => [s.id, s.name]),
);

const ALIASES: Record<string, VendorKind> = {
  rental_store: "camera_rental",
  weblive: "web_live_services",
  web_live: "web_live_services",
  photography_studio: "photography_firm",
  freelance_photographer: "photographer",
  indoor_studios: "outdoor_studios",
};

export function normalizeServiceId(raw: string | null | undefined): VendorKind | null {
  if (!raw) return null;
  if ((CAMARTES_SERVICE_IDS as string[]).includes(raw)) return raw as VendorKind;
  return ALIASES[raw] ?? null;
}

export function normalizeServiceIds(raw: string[] | undefined): VendorKind[] {
  const out: VendorKind[] = [];
  for (const id of raw ?? []) {
    const n = normalizeServiceId(id);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export function primaryService(services: string[], listing: VendorListing): VendorKind {
  const ids = normalizeServiceIds(services);
  if (listing === "business" || listing === "both") {
    const biz = ids.find((id) => BUSINESS_SERVICES.some((s) => s.id === id));
    if (biz) return biz;
  }
  return ids[0] ?? (listing === "business" ? "photography_firm" : "photographer");
}

export function vendorMatchesService(serviceTypes: string[] | undefined, kind: VendorKind, serviceId: VendorKind): boolean {
  const ids = normalizeServiceIds(serviceTypes);
  if (ids.includes(serviceId)) return true;
  const k = normalizeServiceId(kind);
  return k === serviceId;
}
