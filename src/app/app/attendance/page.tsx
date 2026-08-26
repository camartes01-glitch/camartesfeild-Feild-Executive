"use client";

import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useApp } from "@/lib/app-context";
import { formatDuration, monthStats, shiftMinutes } from "@/lib/hours";
import { toast } from "sonner";

const TARGET_DAYS = 22;
const TARGET_MINUTES = 22 * 8 * 60;

export default function AttendancePage() {
  const { state, openShift, clockIn, clockOut, live } = useApp();
  const stats = monthStats(state.shifts);
  const sorted = [...state.shifts].sort((a, b) => b.clockIn.localeCompare(a.clockIn));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Attendance & hours</h1>
        <p className="text-muted-foreground text-sm">Clock in/out with GPS. Totals are for August 2026 so far.</p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-medium">
            {openShift ? `On shift · ${formatDuration(shiftMinutes(openShift))}` : "You are off shift"}
          </p>
          <p className="text-muted-foreground text-xs">
            {live
              ? `Fix ${live.lat.toFixed(5)}, ${live.lng.toFixed(5)} will be stored on clock ${openShift ? "out" : "in"}.`
              : "Turn on location to geotag attendance."}
          </p>
          {openShift ? (
            <Button
              className="w-full"
              size="lg"
              variant="outline"
              onClick={() => {
                clockOut();
                toast.success("Clocked out.");
              }}
            >
              Clock out
            </Button>
          ) : (
            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                clockIn();
                toast.success("Clocked in.");
              }}
            >
              Clock in
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Working days</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.days}</p>
            <p className="text-muted-foreground text-xs">of {TARGET_DAYS} expected</p>
            <Progress className="mt-2" value={Math.min(100, (stats.days / TARGET_DAYS) * 100)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatDuration(stats.minutes)}</p>
            <p className="text-muted-foreground text-xs">of {formatDuration(TARGET_MINUTES)} target</p>
            <Progress className="mt-2" value={Math.min(100, (stats.minutes / TARGET_MINUTES) * 100)} />
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">Shift log</h2>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            No shifts yet. Clock in to start today.
          </p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((s) => (
              <li key={s.id} className="rounded-xl border p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{format(parseISO(s.clockIn), "EEE, d MMM")}</span>
                  <span>{formatDuration(shiftMinutes(s))}</span>
                </div>
                <p className="text-muted-foreground text-xs">
                  In {format(parseISO(s.clockIn), "h:mm a")}
                  {s.clockOut ? ` · Out ${format(parseISO(s.clockOut), "h:mm a")}` : " · still open"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
