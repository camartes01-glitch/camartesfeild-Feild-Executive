"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/lib/app-context";
import { toast } from "sonner";

const SUGGESTED = [
  {
    title: "Proof of delivery OTP",
    body: "4-digit code sent to the customer so kits cannot be marked delivered without the renter.",
  },
  {
    title: "Serial barcode scan",
    body: "Scan body/lens QR at pickup and return to stop kit mix-ups between bookings.",
  },
  {
    title: "Damage & deposit workflow",
    body: "Photograph dents on site, raise a ticket, hold security deposit until QC at the hub.",
  },
  {
    title: "Route batching",
    body: "Group nearby Hyderabad stops (Madhapur + Gachibowli) into one run to cut km and overtime.",
  },
  {
    title: "Offline queue",
    body: "Save photos and clock events when 4G drops in basements, sync when the phone is back online.",
  },
  {
    title: "Hub dispatcher console",
    body: "Live map of all executives, reassign tasks, and SLA timers for wedding-day deliveries.",
  },
  {
    title: "Fuel / auto expense",
    body: "Capture fare receipts against the day’s km so accounts can reimburse without WhatsApp threads.",
  },
  {
    title: "Customer WhatsApp updates",
    body: "Auto-message “executive 20 min away” using live ETA from store to customer.",
  },
  {
    title: "Safety check-in",
    body: "If location is idle 20 minutes mid-task, ping the hub. SOS button to call the store manager.",
  },
  {
    title: "Training & kit care checklist",
    body: "Short SOP at first-time handling of cinema lights or gimbals.",
  },
];

export default function MorePage() {
  const { user, resetDemo, logout } = useApp();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Profile & roadmap</h1>
        <p className="text-muted-foreground text-sm">
          {user?.name} · {user?.employeeId} · {user?.hub}
        </p>
        <p className="text-muted-foreground text-sm">{user?.email}</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Demo data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground text-sm">
            This build stores login, shifts, leave and photos in the browser. No Camartes production API is wired yet.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              resetDemo();
              toast.success("Demo tasks and attendance restored.");
            }}
          >
            Reset demo data
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              logout();
              window.location.href = "/";
            }}
          >
            Log out
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-medium">Suggested next features</h2>
        <ul className="space-y-2">
          {SUGGESTED.map((s) => (
            <li key={s.title} className="rounded-xl border p-3">
              <p className="text-sm font-medium">{s.title}</p>
              <p className="text-muted-foreground text-xs">{s.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
