import type { LeaveRequest, Shift } from "@/lib/types";
import { differenceInCalendarDays, differenceInMinutes, format, parseISO } from "date-fns";

export function shiftMinutes(shift: Shift, now = new Date()) {
  const start = parseISO(shift.clockIn);
  const end = shift.clockOut ? parseISO(shift.clockOut) : now;
  return Math.max(0, differenceInMinutes(end, start));
}

export function formatDuration(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function monthStats(shifts: Shift[], month = new Date()) {
  const key = format(month, "yyyy-MM");
  const inMonth = shifts.filter((s) => s.date.startsWith(key) || s.clockIn.startsWith(key));
  const minutes = inMonth.reduce((acc, s) => acc + shiftMinutes(s, month), 0);
  const days = new Set(inMonth.map((s) => s.date)).size;
  return { minutes, days, shifts: inMonth };
}

export function leaveDaysUsed(leaves: LeaveRequest[]) {
  return leaves
    .filter((l) => l.status === "approved")
    .reduce((acc, l) => acc + l.days, 0);
}

export function calendarDaysInclusive(from: string, to: string) {
  const [fy, fm, fd] = from.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = to.slice(0, 10).split("-").map(Number);
  const a = new Date(fy, fm - 1, fd);
  const b = new Date(ty, tm - 1, td);
  return Math.max(1, differenceInCalendarDays(b, a) + 1);
}

export function leaveUsedByType(leaves: LeaveRequest[], type: LeaveRequest["type"]) {
  return leaves
    .filter((l) => l.type === type && (l.status === "approved" || l.status === "pending"))
    .reduce((acc, l) => acc + l.days, 0);
}

export function localYmd(d = new Date()) {
  return format(d, "yyyy-MM-dd");
}

export function formatWhen(iso: string) {
  return format(parseISO(iso), "d MMM, h:mm a");
}

export function formatDay(isoDate: string) {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return format(new Date(y, m - 1, d), "EEE, d MMM");
}
