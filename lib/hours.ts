import type { LeaveRequest, Shift } from "@/lib/types";
import { differenceInCalendarDays, differenceInMinutes, format, parseISO, startOfMonth } from "date-fns";

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
  const start = startOfMonth(month);
  const inMonth = shifts.filter((s) => parseISO(s.clockIn) >= start && parseISO(s.clockIn) <= month);
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
  const a = parseISO(from.length > 10 ? from : `${from}T00:00:00`);
  const b = parseISO(to.length > 10 ? to : `${to}T00:00:00`);
  return Math.max(1, differenceInCalendarDays(b, a) + 1);
}

export function leaveUsedByType(leaves: LeaveRequest[], type: LeaveRequest["type"]) {
  return leaves
    .filter((l) => l.type === type && l.status === "approved")
    .reduce((acc, l) => acc + l.days, 0);
}

export function formatWhen(iso: string) {
  return format(parseISO(iso), "d MMM, h:mm a");
}

export function formatDay(isoDate: string) {
  return format(parseISO(isoDate.length > 10 ? isoDate : `${isoDate}T00:00:00`), "EEE, d MMM");
}
