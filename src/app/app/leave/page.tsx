"use client";

import { useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/app-context";
import { leaveDaysUsed } from "@/lib/hours";
import type { LeaveType } from "@/lib/types";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";

const ALLOWANCE = 18;

export default function LeavePage() {
  const { state, requestLeave } = useApp();
  const [type, setType] = useState<LeaveType>("casual");
  const [range, setRange] = useState<DateRange | undefined>();
  const [reason, setReason] = useState("");
  const used = leaveDaysUsed(state.leaves);
  const pending = state.leaves.filter((l) => l.status === "pending").reduce((a, l) => a + l.days, 0);

  const leaveDates = useMemo(() => {
    const set = new Set<string>();
    for (const l of state.leaves) {
      if (l.status === "rejected") continue;
      const from = parseISO(l.from);
      const to = parseISO(l.to);
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        set.add(format(d, "yyyy-MM-dd"));
      }
    }
    return set;
  }, [state.leaves]);

  const workDates = useMemo(() => new Set(state.shifts.map((s) => s.date)), [state.shifts]);

  function submit() {
    if (!range?.from) {
      toast.error("Pick leave dates on the planner.");
      return;
    }
    const from = range.from;
    const to = range.to ?? range.from;
    const days = differenceInCalendarDays(to, from) + 1;
    if (!reason.trim()) {
      toast.error("Add a short reason for dispatch.");
      return;
    }
    requestLeave({
      type,
      from: format(from, "yyyy-MM-dd"),
      to: format(to, "yyyy-MM-dd"),
      days,
      reason: reason.trim(),
    });
    setReason("");
    setRange(undefined);
    toast.success("Leave request sent to hub manager.");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Leave planner</h1>
        <p className="text-muted-foreground text-sm">
          {used} approved days used of {ALLOWANCE}. {pending} day(s) pending.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Month view</CardTitle>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            numberOfMonths={1}
            modifiers={{
              worked: (day) => workDates.has(format(day, "yyyy-MM-dd")),
              leave: (day) => leaveDates.has(format(day, "yyyy-MM-dd")),
            }}
            modifiersClassNames={{
              worked: "bg-emerald-100 text-emerald-950",
              leave: "bg-amber-100 text-amber-950",
            }}
          />
          <div className="text-muted-foreground mt-2 flex gap-3 text-xs">
            <span>Green = worked</span>
            <span>Amber = leave</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">New request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as LeaveType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="sick">Sick</SelectItem>
                <SelectItem value="earned">Earned</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why you need the day off" />
          </div>
          <Button className="w-full" onClick={submit}>
            Submit request
          </Button>
        </CardContent>
      </Card>

      <ul className="space-y-2">
        {state.leaves.map((l) => (
          <li key={l.id} className="rounded-xl border p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium capitalize">{l.type}</span>
              <Badge variant={l.status === "approved" ? "secondary" : l.status === "rejected" ? "destructive" : "default"}>
                {l.status}
              </Badge>
              <span className="text-muted-foreground ml-auto text-xs">{l.days}d</span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {l.from}
              {l.to !== l.from ? ` → ${l.to}` : ""} · {l.reason}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
