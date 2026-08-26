"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ExternalLink, Phone } from "lucide-react";
import { FieldMap } from "@/components/field-map";
import { GeoCamera } from "@/components/geo-camera";
import { KindBadge, StatusBadge } from "@/components/task-badges";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useApp } from "@/lib/app-context";
import { formatCoord, formatKm, haversineKm, mapsDirUrl } from "@/lib/geo";
import { formatWhen } from "@/lib/hours";
import { cn } from "@/lib/utils";
import type { FieldTask, TaskKind } from "@/lib/types";
import { toast } from "sonner";

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const { state } = useApp();
  const task = state.tasks.find((t) => t.id === params.id);

  if (!task) {
    return (
      <div className="space-y-3">
        <p className="font-medium">Task not found</p>
        <Link href="/app/tasks" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to tasks
        </Link>
      </div>
    );
  }

  return <TaskBody task={task} />;
}

function TaskBody({ task }: { task: FieldTask }) {
  const { live, setTaskStatus, updateTask } = useApp();

  const you = live ?? task.store.geo;
  const storeCustKm = haversineKm(task.store.geo, task.customerPlace.geo);
  const youStore = haversineKm(you, task.store.geo);
  const youCust = haversineKm(you, task.customerPlace.geo);
  const nextLeg =
    task.kind === "return"
      ? { label: "Customer (pickup)", place: task.customerPlace, km: youCust }
      : task.kind === "delivery" && task.status === "assigned"
        ? { label: "Store (pickup)", place: task.store, km: youStore }
        : { label: "Customer", place: task.customerPlace, km: youCust };

  const photosOk = (checkpoint: string) => task.photos.some((p) => p.checkpoint === checkpoint);

  function complete() {
    const need =
      task.kind === "address_verification"
        ? ["Address / nameplate"]
        : task.kind === "delivery"
          ? ["Store pickup", "Customer delivery"]
          : task.kind === "return"
            ? ["Customer pickup", "Store drop"]
            : ["Shelf / bay"];
    const missing = need.filter((c) => !photosOk(c));
    if (missing.length) {
      toast.error(`Add geotagged photos first: ${missing.join(", ")}`);
      return;
    }
    if (task.kind === "address_verification" && task.addressMatch === "unverified") {
      toast.error("Mark whether the address matches the booking.");
      return;
    }
    setTaskStatus(task.id, "completed", "Task completed with geotagged proof");
    toast.success("Task closed.");
  }

  return (
    <div className="space-y-4">
      <Link href="/app/tasks" className="text-muted-foreground text-sm">
        ← All tasks
      </Link>
      <div className="flex flex-wrap gap-2">
        <KindBadge kind={task.kind} />
        <StatusBadge status={task.status} />
      </div>
      <h1 className="text-xl font-semibold">{task.title}</h1>
      <p className="text-muted-foreground text-sm">
        {task.bookingRef} · due {formatWhen(task.scheduledFor)}
      </p>

      <FieldMap
        center={you}
        markers={[
          { id: "you", label: "You", color: "#d97706", point: you },
          { id: "store", label: task.store.name, color: "#1d4ed8", point: task.store.geo },
          { id: "cust", label: task.customerPlace.name, color: "#047857", point: task.customerPlace.geo },
        ]}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Distances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            Store ↔ customer: <strong>{formatKm(storeCustKm)}</strong>
          </p>
          <p>
            You → store: <strong>{formatKm(youStore)}</strong>
          </p>
          <p>
            You → customer: <strong>{formatKm(youCust)}</strong>
          </p>
          <a
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-2 w-full")}
            href={mapsDirUrl(you, nextLeg.place.geo)}
            target="_blank"
            rel="noreferrer"
          >
            Navigate to {nextLeg.label} ({formatKm(nextLeg.km)})
            <ExternalLink />
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Stops</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Stop
            title="Rental store"
            place={`${task.store.name} · ${task.store.address}`}
            phone={task.store.phone}
          />
          <Stop
            title="Customer"
            place={`${task.customerPlace.name} · ${task.customerPlace.address}`}
            phone={task.customerPhone}
          />
          <p className="text-muted-foreground">{task.notes}</p>
        </CardContent>
      </Card>

      {task.items.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Equipment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {task.items.map((item) => (
              <div key={item.serial} className="rounded-lg border p-2">
                <p className="font-medium">
                  {item.name} × {item.qty}
                </p>
                <p className="text-muted-foreground text-xs">
                  {item.sku} · {item.serial} · {item.condition}
                </p>
                {task.kind === "inventory" ? (
                  <div className="mt-2">
                    <Label className="text-xs">Counted qty</Label>
                    <Input
                      type="number"
                      min={0}
                      value={task.inventoryCounted?.[item.sku] ?? ""}
                      onChange={(e) =>
                        updateTask(task.id, {
                          inventoryCounted: {
                            ...task.inventoryCounted,
                            [item.sku]: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {task.kind === "address_verification" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Address result</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              variant={task.addressMatch === "match" ? "default" : "outline"}
              onClick={() => updateTask(task.id, { addressMatch: "match" })}
            >
              Matches booking
            </Button>
            <Button
              variant={task.addressMatch === "mismatch" ? "destructive" : "outline"}
              onClick={() => updateTask(task.id, { addressMatch: "mismatch" })}
            >
              Does not match
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {task.kind === "delivery" || task.kind === "return" ? (
        <Card>
          <CardContent className="pt-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!task.customerConfirmed}
                onChange={(e) => updateTask(task.id, { customerConfirmed: e.target.checked })}
              />
              Customer confirmed kit handover (name / OTP on site)
            </label>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Geotagged photos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {checkpoints(task.kind).map((cp) => (
            <div key={cp} className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">{cp}</p>
              <GeoCamera taskId={task.id} checkpoint={cp} />
            </div>
          ))}
          {task.photos.length === 0 ? (
            <p className="text-muted-foreground text-sm">No proofs yet.</p>
          ) : (
            <ul className="space-y-3">
              {task.photos.map((p) => (
                <li key={p.id} className="overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.dataUrl} alt={p.checkpoint} className="max-h-56 w-full object-cover" />
                  <div className="text-muted-foreground space-y-0.5 p-2 font-mono text-[11px]">
                    <p>{p.checkpoint}</p>
                    <p>
                      {formatCoord(p.geo.lat, 6)}, {formatCoord(p.geo.lng, 6)} ±{Math.round(p.geo.accuracyM)}m
                    </p>
                    <p>{new Date(p.geo.capturedAt).toLocaleString("en-IN")}</p>
                    {p.note ? <p>Note: {p.note}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {task.timeline.map((ev) => (
            <div key={ev.id} className="flex gap-2">
              <span className="text-muted-foreground w-28 shrink-0 text-xs">
                {formatWhen(ev.at)}
              </span>
              <span>{ev.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Separator />

      <div className="flex flex-col gap-2 pb-4">
        {task.status === "assigned" ? (
          <Button
            size="lg"
            onClick={() => {
              setTaskStatus(task.id, "in_progress", "Started — travelling to first stop");
              toast.success("Task started.");
            }}
          >
            Start task
          </Button>
        ) : null}
        {task.status !== "completed" ? (
          <Button size="lg" variant={task.status === "assigned" ? "outline" : "default"} onClick={complete}>
            Mark complete
          </Button>
        ) : (
          <p className="text-muted-foreground text-center text-sm">Closed {task.completedAt ? formatWhen(task.completedAt) : ""}</p>
        )}
      </div>
    </div>
  );
}

function checkpoints(kind: TaskKind) {
  if (kind === "address_verification") return ["Address / nameplate"];
  if (kind === "delivery") return ["Store pickup", "Customer delivery"];
  if (kind === "return") return ["Customer pickup", "Store drop"];
  return ["Shelf / bay"];
}

function Stop({ title, place, phone }: { title: string; place: string; phone?: string }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground">{place}</p>
      {phone ? (
        <a href={`tel:${phone.replace(/\s/g, "")}`} className="mt-1 inline-flex items-center gap-1 text-xs">
          <Phone className="size-3" /> {phone}
        </a>
      ) : null}
    </div>
  );
}
