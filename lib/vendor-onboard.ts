import type { OnboardInterest, Vendor, VendorStatus, VendorVisitOutcome } from "@/lib/types";

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
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shiftIso(days: number, hour = 11) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00:00+05:30`;
}
