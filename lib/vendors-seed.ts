import { CAMARTES_VENDOR_SNAPSHOT } from "@/lib/camartes-api";
import { SERVICE_TYPE_LABEL } from "@/lib/camartes-services";
import type { OnboardInterest, Vendor } from "@/lib/types";

export const VENDOR_KIND_LABEL: Record<Vendor["kind"], string> = SERVICE_TYPE_LABEL as Record<
  Vendor["kind"],
  string
>;

export const LISTING_LABEL: Record<Vendor["listing"], string> = {
  business: "Business",
  freelancer: "Freelancer",
  both: "Business + freelancer",
};

function lead(
  v: Omit<Vendor, "onboarding" | "interest"> & {
    interest: OnboardInterest;
  },
): Vendor {
  return { ...v, onboarding: true };
}

/** Outlets this FE met or is scheduled to meet for Camartes onboarding. */
export const FIELD_PROSPECTS: Vendor[] = [
  lead({
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
    status: "visited",
    interest: "interested",
    lastVisitedAt: "2026-08-26T16:20:00+05:30",
    nextMeetingAt: "2026-08-28T11:00:00+05:30",
    nextMeetingNote: "Walk through camartes.com listing and GST",
    serviceTypes: ["photography_firm", "outdoor_studios"],
    notes: "Met Ramesh at the studio. Keen to list outdoor sets if bookings come through Camartes.",
    gstin: "36AABCF1122Q1Z5",
    decisionMaker: "Ramesh Iyer, owner",
    competitor: "Walk-in wedding clients",
    ownedKit: "2× studio strobes, 1 backdrop",
    nextShootDate: "2026-08-30",
  }),
  lead({
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
    status: "follow_up",
    interest: "need_time",
    lastVisitedAt: "2026-08-25T12:10:00+05:30",
    nextMeetingAt: "2026-09-02T15:00:00+05:30",
    nextMeetingNote: "Owner travelling; revisit after Ganesh",
    serviceTypes: ["album_designer"],
    notes: "Sana asked for a week to check with her designer partner before deciding.",
    gstin: "Pending",
    decisionMaker: "Sana Begum",
    competitor: "Own Instagram clients",
    ownedKit: "Album design workstation",
    nextShootDate: "After Ganesh",
  }),
  lead({
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
    interest: "to_meet",
    nextMeetingAt: "2026-08-27T15:30:00+05:30",
    nextMeetingNote: "First visit — pitch events + WebLive",
    serviceTypes: ["led_wall"],
    notes: "City manager scheduled a first meeting. Not on camartes.com yet.",
  }),
  lead({
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
    status: "declined",
    interest: "not_interested",
    lastVisitedAt: "2026-08-24T17:40:00+05:30",
    declineReason: "Locked into existing WebLive vendor until December",
    serviceTypes: ["web_live_services"],
    notes: "Visited. Not interested until the current contract ends.",
    gstin: "36AADCC9988P1Z2",
    decisionMaker: "Naveen, ops",
    competitor: "Exclusive WebLive contract",
    ownedKit: "Own encoder + 2 cameras",
    nextShootDate: "Weekly temple streams",
  }),
];

const PIPELINE_CAMARTES_IDS: Record<string, Partial<Vendor>> = {
  user_c3d1003a9d0d: {
    onboarding: true,
    interest: "to_meet",
    nextMeetingAt: "2026-08-27T11:00:00+05:30",
    nextMeetingNote: "Confirm rental kit + GST / KYC",
  },
};

export const VENDORS: Vendor[] = [...CAMARTES_VENDOR_SNAPSHOT, ...FIELD_PROSPECTS].map((v) => {
  const extra = PIPELINE_CAMARTES_IDS[v.id];
  return {
    ...v,
    interest: extra?.interest ?? v.interest ?? "to_meet",
    onboarding: extra?.onboarding ?? v.onboarding ?? v.source === "field",
    nextMeetingAt: extra?.nextMeetingAt ?? v.nextMeetingAt,
    nextMeetingNote: extra?.nextMeetingNote ?? v.nextMeetingNote,
  };
});
