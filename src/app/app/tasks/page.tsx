"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { KindBadge, StatusBadge } from "@/components/task-badges";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/lib/app-context";
import { formatKm, haversineKm } from "@/lib/geo";
import { formatWhen } from "@/lib/hours";
import type { TaskKind } from "@/lib/types";

const FILTERS: { id: "all" | TaskKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "address_verification", label: "Verify" },
  { id: "delivery", label: "Deliver" },
  { id: "return", label: "Return" },
  { id: "inventory", label: "Stock" },
];

export default function TasksPage() {
  const { state, live } = useApp();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | TaskKind>("all");
  const [tab, setTab] = useState("open");

  const list = useMemo(() => {
    return state.tasks.filter((t) => {
      const open = t.status !== "completed";
      if (tab === "open" && !open) return false;
      if (tab === "done" && open) return false;
      if (kind !== "all" && t.kind !== kind) return false;
      const blob = `${t.title} ${t.customerName} ${t.bookingRef} ${t.customerPlace.area}`.toLowerCase();
      if (q && !blob.includes(q.toLowerCase())) return false;
      return true;
    });
  }, [state.tasks, q, kind, tab]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Today’s run</h1>
        <p className="text-muted-foreground text-sm">
          Address checks, store pickups, customer deliveries, returns and hub counts.
        </p>
      </div>
      <Input placeholder="Search customer, booking, area…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="open" className="flex-1">
            Open
          </TabsTrigger>
          <TabsTrigger value="done" className="flex-1">
            Completed
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setKind(f.id)}
            className={`rounded-full border px-2.5 py-1 text-xs ${kind === f.id ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          No tasks in this view.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => {
            const dist = haversineKm(t.store.geo, t.customerPlace.geo);
            const youDist = live
              ? haversineKm(
                  live,
                  t.kind === "delivery" && t.status === "assigned" ? t.store.geo : t.customerPlace.geo,
                )
              : null;
            return (
              <li key={t.id}>
                <Link href={`/app/tasks/${t.id}`} className="block rounded-xl border p-3 hover:bg-muted/40">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <KindBadge kind={t.kind} />
                    <StatusBadge status={t.status} />
                    <span className="text-muted-foreground ml-auto text-xs">{t.id}</span>
                  </div>
                  <p className="font-medium">{t.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {t.customerName} · {t.customerPlace.area}
                  </p>
                  <p className="mt-1 text-xs">
                    Store–customer {formatKm(dist)}
                    {youDist != null ? ` · you ${formatKm(youDist)}` : null} · {formatWhen(t.scheduledFor)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
