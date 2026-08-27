import type { OnboardInterest, Vendor, VendorKind, VendorListing, VendorStatus, VendorVisitOutcome } from "@/lib/types";

export const INTEREST_LABEL: Record<OnboardInterest, string> = {
  to_meet: "To meet",
  interested: "Interested",
  need_time: "Need time",
  not_interested: "Not interested",
  follow_up: "Follow up",
  onboarded: "Onboarded",
};

export const INTEREST_FILTERS: OnboardInterest[] = [
  "to_meet",
  "interested",
  "need_time",
  "not_interested",
  "follow_up",
  "onboarded",
];

export function normalizeOutcome(outcome: VendorVisitOutcome): Exclude<VendorVisitOutcome, "declined"> {
  if (outcome === "declined") return "not_interested";
  return outcome;
}

export function interestFromOutcome(outcome: VendorVisitOutcome, previous?: OnboardInterest): OnboardInterest {
  const o = normalizeOutcome(outcome);
  if (o === "interested") return "interested";
  if (o === "need_time") return "need_time";
  if (o === "not_interested") return "not_interested";
  if (o === "follow_up") return "follow_up";
  if (o === "onboarded") return "onboarded";
  return previous && previous !== "to_meet" ? previous : "to_meet";
}

export function statusFromInterest(interest: OnboardInterest): VendorStatus {
  if (interest === "onboarded") return "onboarded";
  if (interest === "not_interested") return "declined";
  if (interest === "need_time" || interest === "follow_up") return "follow_up";
  if (interest === "interested") return "visited";
  return "prospect";
}

export function interestOf(v: Pick<Vendor, "interest"> | string | undefined): OnboardInterest {
  const raw = typeof v === "string" ? v : v?.interest;
  if (raw && raw in INTEREST_LABEL) return raw as OnboardInterest;
  return "to_meet";
}

export function clampServices(listing: VendorListing, selected: VendorKind[]): VendorKind[] {
  const freelancer: VendorKind[] = [
    "photographer",
    "videographer",
    "album_designer",
    "video_editor",
    "web_live_services",
    "led_wall",
    "fly_cam",
  ];
  const business: VendorKind[] = [
    "photography_firm",
    "camera_rental",
    "service_centres",
    "outdoor_studios",
    "editing_studios",
    "printing_labs",
    "software_services",
  ];
  const allowed = new Set(
    listing === "freelancer" ? freelancer : listing === "business" ? business : [...freelancer, ...business],
  );
  return selected.filter((id) => allowed.has(id));
}

export function isOnboardingLead(v: Vendor): boolean {
  if (v.onboarding) return true;
  if (v.source === "field") return true;
  if (v.lastVisitedAt || v.nextMeetingAt) return true;
  if (v.interest && v.interest !== "to_meet") return true;
  if (v.status && v.status !== "prospect") return true;
  return false;
}

export function badgeTone(interest: OnboardInterest): "peach" | "green" | "blue" | "violet" | "red" {
  if (interest === "interested") return "green";
  if (interest === "onboarded") return "blue";
  if (interest === "need_time") return "peach";
  if (interest === "follow_up") return "violet";
  if (interest === "not_interested") return "red";
  return "peach";
}

export function visitOutcomeLabel(outcome: VendorVisitOutcome) {
  if (outcome === "declined") return INTEREST_LABEL.not_interested;
  if (outcome === "courtesy") return "Courtesy";
  if (outcome === "need_time") return INTEREST_LABEL.need_time;
  if (outcome === "not_interested") return INTEREST_LABEL.not_interested;
  if (outcome === "follow_up") return INTEREST_LABEL.follow_up;
  if (outcome === "onboarded") return INTEREST_LABEL.onboarded;
  if (outcome === "interested") return INTEREST_LABEL.interested;
  return outcome;
}

export function formatMeeting(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Wall-clock IST, independent of the device timezone (this VM is UTC). */
export function shiftIso(days: number, hour = 11) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const h = String(hour).padStart(2, "0");
  return `${ymd}T${h}:00:00+05:30`;
}
