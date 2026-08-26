"use client";

import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Clock3,
  Navigation,
  Radio,
} from "lucide-react";
import { FieldMap } from "@/components/field-map";
import { KindBadge, StatusBadge } from "@/components/task-badges";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/app-context";
import { formatKm, haversineKm, pathKm } from "@/lib/geo";
import { formatDuration, monthStats, shiftMinutes } from "@/lib/hours";
import { LOCATION_PRESETS } from "@/lib/seed";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function HomePage() {
  const { user, state, live, locationMode, setLocationMode, clockIn, clockOut, openShift } =
    useApp();
  const openTasks = state.tasks.filter((t) => t.status !== "completed");
  const next = openTasks[0];
  const stats = monthStats(state.shifts);
  const todayKm = pathKm(
    state.pings.filter((p) => p.at.slice(0, 10) === new Date().toISOString().slice(0, 10)),
  );
  const you = live ?? { lat: 17.4126, lng: 78.4483 };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-muted-foreground text-sm">Hyderabad hub</p>
        <h1 className="text-xl font-semibold">Hello, {user?.name.split(" ")[0]}</h1>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="size-4" /> Live location
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldMap
            center={you}
            markers={[
                  { id: "you", label: "You", color: "#FF6B35", point: you },
              ...(next
                ? [
                    {
                      id: "store",
                      label: next.store.name,
                      color: "#1d4ed8",
                      point: next.store.geo,
                    },
                    {
                      id: "cust",
                      label: next.customerPlace.name,
                      color: "#047857",
                      point: next.customerPlace.geo,
                    },
                  ]
                : []),
            ]}
          />
          <div className="text-sm">
            {live ? (
              <p>
                {live.lat.toFixed(5)}, {live.lng.toFixed(5)} · ±{Math.round(live.accuracyM)} m ·{" "}
                {live.source === "gps" ? "device GPS" : "simulated pin"}
              </p>
            ) : (
              <p className="text-muted-foreground">
                Allow location, or simulate a Hyderabad pin to run tasks in this demo.
              </p>
            )}
          </div>
          <Select value={locationMode} onValueChange={(v) => v && setLocationMode(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Location source" />
            </SelectTrigger>
            <SelectContent>
              {LOCATION_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id === "live" ? "gps" : p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-3 pt-6">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Attendance</p>
            <p className="font-medium">
              {openShift
                ? `On shift · ${formatDuration(shiftMinutes(openShift))}`
                : "Off shift"}
            </p>
            <p className="text-muted-foreground text-xs">
              {stats.days} days · {formatDuration(stats.minutes)} this month
            </p>
          </div>
          {openShift ? (
            <Button
              variant="outline"
              onClick={() => {
                clockOut();
                toast.success("Clocked out. Shift saved.");
              }}
            >
              Clock out
            </Button>
          ) : (
            <Button
              onClick={() => {
                clockIn();
                toast.success("Clocked in. Location attached to this shift.");
              }}
            >
              Clock in
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Open tasks" value={String(openTasks.length)} />
        <Stat label="Km today" value={formatKm(todayKm)} />
        <Stat label="Emp ID" value={user?.employeeId ?? "—"} />
      </div>

      {next ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Next stop</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <KindBadge kind={next.kind} />
              <StatusBadge status={next.status} />
            </div>
            <p className="font-medium">{next.title}</p>
            <p className="text-muted-foreground text-sm">{next.customerPlace.address}</p>
            <p className="text-sm">
              Store → customer {formatKm(haversineKm(next.store.geo, next.customerPlace.geo))}
              {live
                ? ` · you → next ${formatKm(
                    haversineKm(
                      live,
                      next.kind === "return" || next.kind === "address_verification"
                        ? next.customerPlace.geo
                        : next.store.geo,
                    ),
                  )}`
                : null}
            </p>
            <Link
              href={`/app/tasks/${next.id}`}
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
            >
              Open task
              <ArrowRight />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground pt-6 text-sm">
            No open tasks. Great work — check inventory or review leave.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link href="/app/attendance" className={cn(buttonVariants({ variant: "outline" }))}>
          <Clock3 /> Hours
        </Link>
        <Link href="/app/tasks" className={cn(buttonVariants({ variant: "outline" }))}>
          <Navigation /> All tasks
        </Link>
        <Link href="/app/leave" className={cn(buttonVariants({ variant: "outline" }))}>
          Leave planner
        </Link>
        <Link href="/app/more" className={cn(buttonVariants({ variant: "outline" }))}>
          <Camera /> More
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
