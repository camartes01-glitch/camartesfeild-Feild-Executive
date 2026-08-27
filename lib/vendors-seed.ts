import { CAMARTES_VENDOR_SNAPSHOT } from "@/lib/camartes-api";
import type { Vendor } from "@/lib/types";

export const VENDOR_KIND_LABEL: Record<Vendor["kind"], string> = {
  photography_studio: "Photography studio",
  freelance_photographer: "Freelance photographer",
  videographer: "Videographer",
  album_designer: "Album designer",
  video_editor: "Video editor",
  led_wall: "LED wall",
  weblive: "WebLive / webcast",
  rental_store: "Camera rental store",
};

export const LISTING_LABEL: Record<Vendor["listing"], string> = {
  business: "Business",
  freelancer: "Freelancer",
  both: "Business + freelancer",
};

/** Nearby walk-ins that are not yet on camartes.com (LED / WebLive / album). */
export const FIELD_PROSPECTS: Vendor[] = [
  {
    id: "vn-studio-filmfare",
    kind: "photography_studio",
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
    notes: "Not listed on camartes.com yet. Wedding stills floor — pitch marketplace listing.",
  },
  {
    id: "vn-album-kraft",
    kind: "album_designer",
    listing: "business",
    source: "field",
    name: "Album Kraft",
    contact: "Sana Begum",
    phone: "+91 99122 55670",
    address: "Botanical Garden Road, Kondapur, Hyderabad",
    area: "Kondapur",
    city: "Hyderabad",
    geo: { lat: 17.4661, lng: 78.3652 },
    status: "prospect",
    notes: "Not listed on camartes.com yet. High-end wedding albums.",
  },
  {
    id: "vn-led-pixel",
    kind: "led_wall",
    listing: "business",
    source: "field",
    name: "Pixel LED Walls",
    contact: "Arun Babu",
    phone: "+91 98660 33421",
    address: "Cyber Towers lane, HITEC City, Hyderabad",
    area: "HITEC City",
    city: "Hyderabad",
    geo: { lat: 17.4501, lng: 78.3802 },
    status: "prospect",
    notes: "Not listed on camartes.com yet. P3 indoor walls for sangeet.",
  },
  {
    id: "vn-weblive-camstream",
    kind: "weblive",
    listing: "business",
    source: "field",
    name: "CamStream WebLive",
    contact: "Naveen",
    phone: "+91 90000 44130",
    address: "Paradise Circle, Secunderabad",
    area: "Secunderabad",
    city: "Hyderabad",
    geo: { lat: 17.4399, lng: 78.4983 },
    status: "prospect",
    notes: "Not listed on camartes.com yet. OBS + bonded LTE kits.",
  },
];

export const VENDORS: Vendor[] = [...CAMARTES_VENDOR_SNAPSHOT, ...FIELD_PROSPECTS];
