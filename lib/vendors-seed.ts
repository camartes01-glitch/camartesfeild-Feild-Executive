import { CAMARTES_VENDOR_SNAPSHOT } from "@/lib/camartes-api";
import { SERVICE_TYPE_LABEL } from "@/lib/camartes-services";
import type { Vendor } from "@/lib/types";

export const VENDOR_KIND_LABEL: Record<Vendor["kind"], string> = SERVICE_TYPE_LABEL as Record<
  Vendor["kind"],
  string
>;

export const LISTING_LABEL: Record<Vendor["listing"], string> = {
  business: "Business",
  freelancer: "Freelancer",
  both: "Business + freelancer",
};

/** Nearby walk-ins not yet listed under a camartes.com Services category. */
export const FIELD_PROSPECTS: Vendor[] = [
  {
    id: "vn-studio-filmfare",
    kind: "photography_firm",
    listing: "business",
    source: "field",
    name: "Filmfare Studio",
    contact: "Ramesh Iyer",
    phone: "+91 98480 22110",
    address: "Road No. 10, Banjara Hills, Hyderabad",
    area: "Banjara Hills",
    city: "Hyderabad",
    geo: { lat: 17.4152, lng: 78.4411 },
    status: "prospect",
    serviceTypes: ["photography_firm", "outdoor_studios"],
    notes: "Not listed on camartes.com yet. Pitch Photography Firm + Outdoor Studios.",
  },
  {
    id: "vn-album-kraft",
    kind: "album_designer",
    listing: "freelancer",
    source: "field",
    name: "Album Kraft",
    contact: "Sana Begum",
    phone: "+91 99122 55670",
    address: "Botanical Garden Road, Kondapur, Hyderabad",
    area: "Kondapur",
    city: "Hyderabad",
    geo: { lat: 17.4661, lng: 78.3652 },
    status: "prospect",
    serviceTypes: ["album_designer"],
    notes: "Not listed on camartes.com yet. Album Designer category.",
  },
  {
    id: "vn-led-pixel",
    kind: "led_wall",
    listing: "freelancer",
    source: "field",
    name: "Pixel LED Walls",
    contact: "Arun Babu",
    phone: "+91 98660 33421",
    address: "Cyber Towers lane, HITEC City, Hyderabad",
    area: "HITEC City",
    city: "Hyderabad",
    geo: { lat: 17.4501, lng: 78.3802 },
    status: "prospect",
    serviceTypes: ["led_wall"],
    notes: "Not listed on camartes.com yet. LED Wall category.",
  },
  {
    id: "vn-weblive-camstream",
    kind: "web_live_services",
    listing: "freelancer",
    source: "field",
    name: "CamStream WebLive",
    contact: "Naveen",
    phone: "+91 90000 44130",
    address: "Paradise Circle, Secunderabad",
    area: "Secunderabad",
    city: "Hyderabad",
    geo: { lat: 17.4399, lng: 78.4983 },
    status: "prospect",
    serviceTypes: ["web_live_services"],
    notes: "Not listed on camartes.com yet. Web/Live Services category.",
  },
];

export const VENDORS: Vendor[] = [...CAMARTES_VENDOR_SNAPSHOT, ...FIELD_PROSPECTS];
