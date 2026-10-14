/**
 * City Manager operations console (web first, responsive down to phone width).
 * Every number here comes from the Field Operations API — nothing is computed from local state.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Redirect } from "expo-router";
import { Badge, BrandMark, Button, Card, Field, Muted } from "@/components/ui";
import { Chip, ChipWrap } from "@/components/chips";
import { MiniMap, type MapMarker } from "@/components/mini-map";
import { SlaBadge, StateBadge } from "@/components/status";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { clockOffsetMs, slaView } from "@/lib/field-ops";
import { mediaUrl, OPS } from "@/lib/ops-api";
import type { GeoBrief, Hub, OnboardingVisit, Principal, Roster, ShiftSummary, Task, TaskDetail } from "@/lib/types";
import { LocationField } from "@/components/location-picker";
import type { GeoUnit } from "@/lib/geography";

type Section = "overview" | "map" | "jobs" | "team" | "roster" | "onboarding" | "approvals" | "sos";

type Dashboard = {
  serverTime: string;
  date: string;
  fe: { total: number; clockedIn: number; available: number; onTask: number; offline: number };
  jobs: { total: number; completed: number; pending: number; failedAttempts: number; slaAtRisk: number; slaBreached: number };
  openSos: number;
};

type FeState = {
  employee: Principal;
  presence: "OFF_SHIFT" | "OFFLINE" | "ON_TASK" | "AVAILABLE";
  shift: { id: string; clockIn: string } | null;
  lastGps: { lat: number; lng: number; accuracyM: number | null; at: string; receivedAt: string; class: string } | null;
  currentTask: Task | null;
  route?: { lat: number; lng: number }[];
};

const SECTIONS: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "map", label: "Live map" },
  { id: "jobs", label: "Jobs & SLA" },
  { id: "team", label: "Field team" },
  { id: "roster", label: "Rosters" },
  { id: "onboarding", label: "Onboarding" },
  { id: "approvals", label: "Approvals" },
  { id: "sos", label: "SOS & audit" },
];

const PRESENCE_TONE: Record<FeState["presence"], "green" | "peach" | "red" | "default"> = {
  AVAILABLE: "green",
  ON_TASK: "peach",
  OFFLINE: "red",
  OFF_SHIFT: "default",
};

/** A stored area reference shown in the location field until the full hierarchy is loaded by the picker. */
function briefUnit(b: GeoBrief | null | undefined): GeoUnit | null {
  return b ? { id: b.id, name: b.name, level: b.level, levelLabel: b.subtype || b.level.replace("_", " ").toLowerCase(), hierarchy: b.name } : null;
}

function ist(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" }) : "—";
}

function ago(iso: string | null | undefined) {
  if (!iso) return "—";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)}h ${min % 60}m ago`;
}

export default function AdminScreen() {
  const { ready, user, logout, get } = useApp();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [section, setSection] = useState<Section>("overview");
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [employees, setEmployees] = useState<FeState[]>([]);

  const loadShared = useCallback(async () => {
    const [h, e] = await Promise.all([get<{ hubs: Hub[] }>(`${OPS}/hubs`), get<{ employees: FeState[] }>(`${OPS}/manager/employees`)]);
    if (h.ok) setHubs(h.body.hubs);
    if (e.ok) setEmployees(e.body.employees);
  }, [get]);

  useEffect(() => {
    if (user?.role === "operations_manager") void loadShared();
  }, [user, loadShared]);

  if (!ready) return null;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== "operations_manager") return <Redirect href="/" />;

  const nav = (
    <View style={wide ? styles.sidebar : styles.topnav}>
      {wide ? (
        <View style={styles.brand}>
          <BrandMark />
          <View>
            <Text style={styles.brandTitle}>Camartes Ops</Text>
            <Muted>{user.scopeGeoUnit ? `${user.scopeGeoUnit.name} · Area manager` : user.city ? `${user.city} · City manager` : "HQ · All areas"}</Muted>
          </View>
        </View>
      ) : null}
      <ScrollView horizontal={!wide} showsHorizontalScrollIndicator={false} contentContainerStyle={wide ? { gap: 4 } : { gap: 6, paddingHorizontal: 12 }}>
        {SECTIONS.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => setSection(s.id)}
            style={[wide ? styles.navItem : styles.navChip, section === s.id && styles.navActive]}
          >
            <Text style={[styles.navText, section === s.id && styles.navTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {wide ? (
        <View style={{ marginTop: "auto", gap: 6 }}>
          <Muted>{user.displayName}</Muted>
          <Button label="Sign out" variant="ghost" onPress={() => logout()} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.shell, { flexDirection: wide ? "row" : "column" }]}>
      {!wide ? (
        <View style={styles.mobileHeader}>
          <Text style={styles.brandTitle}>Camartes Ops</Text>
          <Button compact label="Sign out" variant="ghost" onPress={() => logout()} />
        </View>
      ) : null}
      {nav}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.main}>
        {section === "overview" ? <Overview onOpen={setSection} /> : null}
        {section === "map" ? (
          <>
            <LiveMap hubs={hubs} />
            <HubAreas hubs={hubs} onSaved={loadShared} />
          </>
        ) : null}
        {section === "jobs" ? <Jobs employees={employees} hubs={hubs} /> : null}
        {section === "team" ? <Team employees={employees} refresh={loadShared} /> : null}
        {section === "roster" ? <Rosters employees={employees} hubs={hubs} /> : null}
        {section === "onboarding" ? <Onboarding employees={employees} /> : null}
        {section === "approvals" ? <Approvals employees={employees} /> : null}
        {section === "sos" ? <SosAudit employees={employees} /> : null}
      </ScrollView>
    </View>
  );
}

function usePolling<T>(path: string | null, ms = 30_000) {
  const { get } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!path) return;
    const res = await get<T>(path);
    if (res.ok) {
      setData(res.body);
      setError(null);
    } else setError(res.message);
  }, [get, path]);
  useEffect(() => {
    void load();
    if (!ms) return;
    const id = setInterval(() => void load(), ms);
    return () => clearInterval(id);
  }, [load, ms]);
  return { data, error, reload: load };
}

function Heading({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.heading}>
      <View style={{ flex: 1 }}>
        <Text style={styles.h1}>{title}</Text>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>
      {action}
    </View>
  );
}

function Metric({ label, value, tone, onPress }: { label: string; value: number | string; tone?: "red" | "peach" | "green"; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.metric, tone === "red" && styles.metricRed]}>
      <Text style={[styles.metricValue, tone === "red" && { color: colors.danger }, tone === "green" && { color: "#047857" }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Pressable>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function Overview({ onOpen }: { onOpen: (s: Section) => void }) {
  const { data, error } = usePolling<Dashboard>(`${OPS}/manager/dashboard`);
  if (!data) return <Muted>{error ?? "Loading…"}</Muted>;
  return (
    <View style={{ gap: 16 }}>
      <Heading title="Operations overview" subtitle={`${data.date} · live · updated ${ist(data.serverTime)}`} />
      {data.openSos ? (
        <Pressable onPress={() => onOpen("sos")} style={styles.sosAlert}>
          <Text style={styles.sosAlertText}>{data.openSos} open SOS — tap to respond</Text>
        </Pressable>
      ) : null}
      <Text style={styles.h2}>Field executives</Text>
      <View style={styles.metrics}>
        <Metric label="Total FEs" value={data.fe.total} onPress={() => onOpen("team")} />
        <Metric label="Clocked in" value={data.fe.clockedIn} tone="green" onPress={() => onOpen("map")} />
        <Metric label="Available" value={data.fe.available} />
        <Metric label="On task" value={data.fe.onTask} tone="peach" />
        <Metric label="Offline (no GPS)" value={data.fe.offline} tone={data.fe.offline ? "red" : undefined} onPress={() => onOpen("map")} />
      </View>
      <Text style={styles.h2}>Jobs today</Text>
      <View style={styles.metrics}>
        <Metric label="Total jobs" value={data.jobs.total} onPress={() => onOpen("jobs")} />
        <Metric label="Completed" value={data.jobs.completed} tone="green" />
        <Metric label="Pending" value={data.jobs.pending} />
        <Metric label="Failed attempts" value={data.jobs.failedAttempts} tone={data.jobs.failedAttempts ? "red" : undefined} />
        <Metric label="SLA at risk" value={data.jobs.slaAtRisk} tone={data.jobs.slaAtRisk ? "peach" : undefined} onPress={() => onOpen("jobs")} />
        <Metric label="SLA breached" value={data.jobs.slaBreached} tone={data.jobs.slaBreached ? "red" : undefined} onPress={() => onOpen("jobs")} />
      </View>
    </View>
  );
}

// ── Live map ─────────────────────────────────────────────────────────────────

function LiveMap({ hubs }: { hubs: Hub[] }) {
  const { data, error } = usePolling<{ serverTime: string; hubs: Hub[]; executives: FeState[] }>(`${OPS}/manager/map`, 20_000);
  const [selected, setSelected] = useState<string | null>(null);
  const execs = data?.executives ?? [];
  const markers: MapMarker[] = [
    ...(data?.hubs ?? hubs).map((h) => ({ id: `hub-${h.id}`, label: h.name, subtitle: "Camartes hub", color: colors.ink, point: h })),
    ...execs
      .filter((e) => e.lastGps)
      .map((e) => ({
        id: e.employee.id,
        label: e.employee.displayName,
        subtitle: `${e.presence} · ${ago(e.lastGps!.receivedAt)}${e.currentTask ? ` · ${e.currentTask.taskCode}` : ""}`,
        color: e.presence === "OFFLINE" ? colors.danger : e.presence === "ON_TASK" ? colors.primary : colors.success,
        point: e.lastGps!,
      })),
  ];
  const paths = execs
    .filter((e) => (e.route?.length ?? 0) > 1 && (!selected || e.employee.id === selected))
    .map((e) => ({ id: e.employee.id, color: e.presence === "ON_TASK" ? colors.primary : colors.success, points: e.route! }));
  return (
    <View style={{ gap: 16 }}>
      <Heading title="Live map" subtitle="Banjara Hills & HITEC City hubs · FE positions from shift GPS trail (refreshes every 20 s)" />
      {error ? <Muted>{error}</Muted> : null}
      <MiniMap height={440} markers={markers} paths={paths} selectedId={selected} onSelectMarker={setSelected} showLabels emptyMessage="No hub or FE positions yet" />
      <View style={{ gap: 8 }}>
        {execs.map((e) => (
          <Pressable key={e.employee.id} onPress={() => setSelected(e.employee.id)} style={[styles.row, selected === e.employee.id && styles.rowSelected]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {e.employee.displayName} · {e.employee.employeeId}
              </Text>
              <Muted>
                Last GPS {ago(e.lastGps?.receivedAt)} {e.lastGps ? `· ±${Math.round(e.lastGps.accuracyM ?? 0)} m · ${e.lastGps.class}` : ""}
              </Muted>
              {e.currentTask ? (
                <Muted>
                  {e.currentTask.taskCode} · {e.currentTask.title}
                </Muted>
              ) : null}
            </View>
            <View style={styles.badgeCol}>
              <Badge label={e.presence.replace("_", " ")} tone={PRESENCE_TONE[e.presence]} />
              {e.currentTask ? <StateBadge state={e.currentTask.state} /> : null}
              {e.currentTask ? <SlaBadge sla={e.currentTask.sla} serverTime={data?.serverTime} /> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Each hub's administrative area. Drives geographic scoping of the hub's employees and jobs. */
function HubAreas({ hubs, onSaved }: { hubs: Hub[]; onSaved: () => Promise<void> }) {
  const { send } = useApp();
  async function save(hub: Hub, unit: GeoUnit | null) {
    if (!unit) return;
    const res = await send(`${OPS}/hubs/${encodeURIComponent(hub.id)}/geography`, { geoUnitId: unit.id }, "PUT");
    if (!res.ok) return Alert.alert("Could not set the hub area", res.message);
    await onSaved();
  }
  if (!hubs.length) return null;
  return (
    <Card>
      <Heading title="Hub areas" subtitle="District, mandal or city each hub belongs to. Used for area-based access." />
      {hubs.map((h) => (
        <LocationField key={h.id} label={h.name} hint="Not set yet" value={briefUnit(h.geo)} onChange={(u) => void save(h, u)} />
      ))}
    </Card>
  );
}

// ── Jobs & SLA ───────────────────────────────────────────────────────────────

const JOB_FILTERS = [
  { id: "open", label: "Open", query: "status=open" },
  { id: "breached", label: "SLA breached", query: "sla=BREACHED" },
  { id: "risk", label: "SLA at risk", query: "sla=AT_RISK" },
  { id: "failed", label: "Failed attempts", query: "status=failed_attempt" },
  { id: "done", label: "Completed", query: "status=completed" },
  { id: "all", label: "All", query: "" },
] as const;

function Jobs({ employees, hubs }: { employees: FeState[]; hubs: Hub[] }) {
  const { config } = useApp();
  const [filter, setFilter] = useState<(typeof JOB_FILTERS)[number]["id"]>("open");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const q = JOB_FILTERS.find((f) => f.id === filter)!.query;
  const { data, reload } = usePolling<{ tasks: Task[]; total: number; serverTime: string }>(
    `${OPS}/manager/tasks?${q}&limit=50&offset=${page * 50}`,
    30_000,
  );
  const names = useMemo(() => new Map(employees.map((e) => [e.employee.id, e.employee.displayName])), [employees]);
  const offset = clockOffsetMs(data?.serverTime);
  return (
    <View style={{ gap: 12 }}>
      <Heading title="Jobs & SLA" subtitle="Red rows are past their server SLA deadline" action={<Button compact label="New job" onPress={() => setCreating(true)} />} />
      <ChipWrap>
        {JOB_FILTERS.map((f) => (
          <Chip key={f.id} label={f.label} selected={filter === f.id} onPress={() => { setFilter(f.id); setPage(0); }} />
        ))}
      </ChipWrap>
      {(data?.tasks ?? []).map((t) => {
        const red = slaView(t.sla, offset, config?.rules.slaAtRiskMin ?? 45, Date.now(), t.state === "COMPLETED").status === "BREACHED";
        return (
          <Pressable key={t.id} onPress={() => setDetail(t.id)} style={[styles.row, red && styles.rowRed]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {t.taskCode} · {t.title}
              </Text>
              <Muted>
                {t.kind} · {t.assigneeId ? names.get(t.assigneeId) ?? t.assigneeId : "Unassigned"} · {t.stop?.name ?? t.area ?? ""}
              </Muted>
            </View>
            <View style={styles.badgeCol}>
              <StateBadge state={t.state} />
              <SlaBadge sla={t.sla} serverTime={data?.serverTime} completed={t.state === "COMPLETED"} />
            </View>
          </Pressable>
        );
      })}
      {data && data.tasks.length === 0 ? <Muted>No jobs in this view.</Muted> : null}
      {data && data.total > 50 ? (
        <View style={styles.pager}>
          <Button compact label="Previous" variant="ghost" disabled={page === 0} onPress={() => setPage((p) => p - 1)} />
          <Muted>
            {page * 50 + 1}–{Math.min(data.total, (page + 1) * 50)} of {data.total}
          </Muted>
          <Button compact label="Next" variant="ghost" disabled={(page + 1) * 50 >= data.total} onPress={() => setPage((p) => p + 1)} />
        </View>
      ) : null}
      {detail ? <TaskDrawer id={detail} employees={employees} onClose={() => { setDetail(null); void reload(); }} /> : null}
      {creating ? <CreateJob employees={employees} hubs={hubs} onClose={() => { setCreating(false); void reload(); }} /> : null}
    </View>
  );
}

function TaskDrawer({ id, employees, onClose }: { id: string; employees: FeState[]; onClose: () => void }) {
  const { get, send } = useApp();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [newDue, setNewDue] = useState("");
  const load = useCallback(async () => {
    const res = await get<TaskDetail>(`${OPS}/manager/tasks/${encodeURIComponent(id)}`);
    if (res.ok) setTask(res.body);
  }, [get, id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, body: unknown, method: "POST" | "PUT" = "POST") {
    const res = await send(path, body, method);
    if (!res.ok) Alert.alert("Not allowed", res.message);
    await load();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.drawer}>
          <ScrollView contentContainerStyle={{ gap: 10, padding: 18 }}>
            <View style={styles.heading}>
              <Text style={[styles.h1, { flex: 1 }]}>{task ? `${task.taskCode} · ${task.title}` : "Loading…"}</Text>
              <Button compact label="Close" variant="ghost" onPress={onClose} />
            </View>
            {task ? (
              <>
                <View style={styles.badgeRow}>
                  <StateBadge state={task.state} />
                  <SlaBadge sla={task.sla} serverTime={task.serverTime} completed={task.state === "COMPLETED"} />
                  <Badge label={`Attempt ${task.attemptNo}`} tone="violet" />
                </View>
                <Muted>
                  Stop: {task.stop?.name ?? "—"} · {task.stop?.address ?? ""} {task.stop ? `(${task.stop.lat.toFixed(5)}, ${task.stop.lng.toFixed(5)})` : "· no verified location"}
                </Muted>
                {task.sla.lateReason ? <Muted>Late reason: {task.sla.lateReason}</Muted> : null}
                {task.items.map((i) => (
                  <Muted key={i.itemId}>
                    Kit {i.name} · {i.serial} · {i.locationType} · serial {i.serialVerified ? "verified" : "pending"}
                  </Muted>
                ))}
                <Text style={styles.h2}>Evidence</Text>
                <Muted>
                  Check-in: {task.evidence.checkIn ? `${task.evidence.checkIn.distanceM} m from stop at ${ist(task.evidence.checkIn.at)}` : "none"}
                  {task.evidence.rejectedCheckIns.length ? ` · ${task.evidence.rejectedCheckIns.length} rejected attempt(s)` : ""}
                </Muted>
                <Muted>Kit condition: {task.evidence.kitConditions.map((k) => `${k.grade}${k.notes ? ` (${k.notes})` : ""}`).join(", ") || "—"}</Muted>
                <Muted>PIN: {task.evidence.pin?.state ?? (task.evidence.pinRequired ? "not generated" : "not required")}</Muted>
                <View style={styles.thumbs}>
                  {task.evidence.photos.map((p) =>
                    p.url ? <Image key={p.id} source={{ uri: mediaUrl(p.url)! }} style={styles.thumb} accessibilityLabel={p.checkpoint} /> : null,
                  )}
                </View>
                {task.evidence.pod ? (
                  <View style={{ gap: 4 }}>
                    <Text style={styles.rowTitle}>POD · {task.evidence.pod.recipientName} · {ist(task.evidence.pod.at)}</Text>
                    {task.evidence.pod.signatureUrl ? (
                      <Image source={{ uri: mediaUrl(task.evidence.pod.signatureUrl)! }} style={styles.signature} resizeMode="contain" />
                    ) : null}
                  </View>
                ) : null}
                {task.evidence.failures.map((f) => (
                  <Muted key={f.at}>
                    Failed attempt {f.attemptNo}: {f.label} {f.notes ? `— ${f.notes}` : ""} · SLA {f.slaStatus ?? "—"} · {ist(f.at)}
                  </Muted>
                ))}
                <Text style={styles.h2}>Actions</Text>
                {["UNASSIGNED", "ASSIGNED", "RETRY"].includes(task.state) ? (
                  <>
                    <ChipWrap>
                      {employees.map((e) => (
                        <Chip key={e.employee.id} label={e.employee.displayName} selected={assignee === e.employee.id} onPress={() => setAssignee(e.employee.id)} />
                      ))}
                    </ChipWrap>
                    <Button compact label="Assign" disabled={!assignee} onPress={() => void act(`${OPS}/tasks/${task.id}/assign`, { assigneeId: assignee })} />
                  </>
                ) : null}
                {task.state === "FAILED_ATTEMPT" ? (
                  <>
                    <Field label="New due (YYYY-MM-DD HH:MM IST, optional)" value={newDue} onChangeText={setNewDue} />
                    <Button compact label="Schedule retry" onPress={() => void act(`${OPS}/tasks/${task.id}/retry`, { reason: "Rescheduled by city manager", ...(newDue ? { newDueAt: newDue } : {}) })} />
                  </>
                ) : null}
                {!["COMPLETED", "CANCELLED"].includes(task.state) ? (
                  <Button compact label="Cancel job" variant="danger" onPress={() => void act(`${OPS}/tasks/${task.id}/status`, { status: "cancelled", label: "Cancelled by city manager" })} />
                ) : null}
                <Text style={styles.h2}>History</Text>
                {task.timeline.map((e) => (
                  <Muted key={e.id}>
                    {ist(e.at)} · {e.label}
                  </Muted>
                ))}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const KINDS = ["pickup", "delivery", "return", "address_verification", "vendor_visit"] as const;

function CreateJob({ employees, hubs, onClose }: { employees: FeState[]; hubs: Hub[]; onClose: () => void }) {
  const { send } = useApp();
  const [kind, setKind] = useState<(typeof KINDS)[number]>("delivery");
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [stopName, setStopName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [due, setDue] = useState("");
  const [serials, setSerials] = useState("");
  const [hub, setHub] = useState<string | null>(null);
  const [area, setArea] = useState<GeoUnit | null>(null);
  const [busy, setBusy] = useState(false);
  const coordsOk = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== "" && lng !== "";

  async function submit() {
    setBusy(true);
    const res = await send(`${OPS}/tasks`, {
      title,
      kind,
      assigneeId: assignee ?? undefined,
      customerName: customer,
      customerPhone: phone,
      hubId: hub ?? undefined,
      geoUnitId: area?.id ?? undefined,
      stop: { type: kind === "pickup" ? "HUB" : "CUSTOMER", name: stopName || customer, address, lat: Number(lat), lng: Number(lng) },
      dueAt: due || undefined,
      items: serials.split(",").map((s) => s.trim()).filter(Boolean).map((serial) => ({ serial })),
    });
    setBusy(false);
    if (!res.ok) return Alert.alert("Could not create job", res.message);
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.drawer}>
          <ScrollView contentContainerStyle={{ gap: 10, padding: 18 }}>
            <View style={styles.heading}>
              <Text style={[styles.h1, { flex: 1 }]}>New job</Text>
              <Button compact label="Close" variant="ghost" onPress={onClose} />
            </View>
            <ChipWrap>
              {KINDS.map((k) => (
                <Chip key={k} label={k.replace("_", " ")} selected={kind === k} onPress={() => setKind(k)} />
              ))}
            </ChipWrap>
            <Field label="Title" value={title} onChangeText={setTitle} />
            <Text style={styles.label}>Assign to</Text>
            <ChipWrap>
              {employees.map((e) => (
                <Chip key={e.employee.id} label={e.employee.displayName} selected={assignee === e.employee.id} onPress={() => setAssignee(e.employee.id)} />
              ))}
            </ChipWrap>
            <Text style={styles.label}>Hub</Text>
            <ChipWrap>
              {hubs.map((h) => (
                <Chip key={h.id} label={h.name} selected={hub === h.id} onPress={() => setHub(h.id)} />
              ))}
            </ChipWrap>
            <Field label="Customer / outlet name" value={customer} onChangeText={setCustomer} />
            <Field label="Customer phone (WhatsApp updates)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field label="Stop name" value={stopName} onChangeText={setStopName} />
            <Field label="Stop address" value={address} onChangeText={setAddress} />
            <LocationField label="Customer area (optional)" hint="Village, town or locality, for area reports and scoping." value={area} onChange={setArea} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label="Stop latitude (verified)" value={lat} onChangeText={setLat} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Stop longitude (verified)" value={lng} onChangeText={setLng} keyboardType="decimal-pad" />
              </View>
            </View>
            <Field label="Due (YYYY-MM-DD HH:MM IST) — blank uses default SLA" value={due} onChangeText={setDue} />
            {kind === "pickup" || kind === "delivery" || kind === "return" ? (
              <Field label="Kit serials (comma separated, must exist in inventory)" value={serials} onChangeText={setSerials} />
            ) : null}
            <Button label={busy ? "Creating…" : "Create job"} disabled={!title.trim() || !coordsOk || busy} onPress={() => void submit()} />
            {!coordsOk ? <Muted>A verified stop location is required for the 150 m check-in.</Muted> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Team ─────────────────────────────────────────────────────────────────────

type EmployeeDetail = FeState & {
  rosterToday: Roster;
  rosterTomorrow: Roster;
  shifts: ({ id: string; clockIn: string; clockOut: string | null; clockInVia: string | null; overrideReason: string | null; summary: ShiftSummary })[];
  tasks: Task[];
  failures: { taskId: string; code: string; label: string; notes: string | null; attemptNo: number; at: string }[];
  onboardingVisits: OnboardingVisit[];
  inventoryMovements: { id: string; serial: string; movementType: string; from: { type: string; id: string }; to: { type: string; id: string }; condition: string; at: string }[];
  audit: { id: string; action: string; entityType: string; entityId: string | null; at: string }[];
};

function Team({ employees, refresh }: { employees: FeState[]; refresh: () => Promise<void> }) {
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(id);
  }, [refresh]);
  return (
    <View style={{ gap: 12 }}>
      <Heading title="Field team" subtitle="Camartes employees · live shift status" />
      {employees.map((e) => (
        <Pressable key={e.employee.id} onPress={() => setSelected(e.employee.id)} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>
              {e.employee.displayName} · {e.employee.employeeId}
            </Text>
            <Muted>
              {e.shift ? `On shift since ${ist(e.shift.clockIn)}` : "Off shift"} · last GPS {ago(e.lastGps?.receivedAt)}
            </Muted>
          </View>
          <Badge label={e.presence.replace("_", " ")} tone={PRESENCE_TONE[e.presence]} />
        </Pressable>
      ))}
      {selected ? <EmployeeDrawer id={selected} onClose={() => setSelected(null)} /> : null}
    </View>
  );
}

function EmployeeDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { get, send } = useApp();
  const [data, setData] = useState<EmployeeDetail | null>(null);
  const [trail, setTrail] = useState<{ points: { lat: number; lng: number; class: string }[]; summary: ShiftSummary } | null>(null);
  useEffect(() => {
    void get<EmployeeDetail>(`${OPS}/manager/employees/${id}`).then((r) => r.ok && setData(r.body));
  }, [get, id]);

  async function setArea(unit: GeoUnit | null) {
    const res = await send(`${OPS}/principals/${encodeURIComponent(id)}/geography`, { geoUnitId: unit ? unit.id : null }, "PUT");
    if (!res.ok) return Alert.alert("Could not change the area", res.message);
    const fresh = await get<EmployeeDetail>(`${OPS}/manager/employees/${id}`);
    if (fresh.ok) setData(fresh.body);
  }

  async function showTrail(shiftId: string) {
    const r = await get<{ points: { lat: number; lng: number; class: string }[]; summary: ShiftSummary }>(`${OPS}/gps/shifts/${shiftId}`);
    if (r.ok) setTrail(r.body);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.drawer}>
          <ScrollView contentContainerStyle={{ gap: 10, padding: 18 }}>
            <View style={styles.heading}>
              <Text style={[styles.h1, { flex: 1 }]}>{data ? `${data.employee.displayName} · ${data.employee.employeeId}` : "Loading…"}</Text>
              <Button compact label="Close" variant="ghost" onPress={onClose} />
            </View>
            {data ? (
              <>
                <View style={styles.badgeRow}>
                  <Badge label={data.presence.replace("_", " ")} tone={PRESENCE_TONE[data.presence]} />
                  <Badge label={data.employee.emailOrPhone} tone="default" />
                </View>
                {data.currentTask ? (
                  <Muted>
                    Current: {data.currentTask.taskCode} · {data.currentTask.title}
                  </Muted>
                ) : null}
                <LocationField
                  label="Operational area"
                  hint="Falls back to the hub's area when not set."
                  value={briefUnit(data.employee.geoUnit)}
                  onChange={(u) => void setArea(u)}
                />
                <Text style={styles.h2}>Roster</Text>
                {[data.rosterToday, data.rosterTomorrow].map((r) => (
                  <Muted key={r.date}>
                    {r.date}: {r.published ? `${r.shiftStart}–${r.shiftEnd} · ${r.stops.length} stops` : "not published"}
                  </Muted>
                ))}
                <Text style={styles.h2}>Shifts & GPS trail</Text>
                {data.shifts.map((s) => (
                  <View key={s.id} style={styles.subRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>
                        {ist(s.clockIn)} → {s.clockOut ? ist(s.clockOut) : "open"} · {s.clockInVia}
                      </Text>
                      <Muted>
                        Worked {Math.round(s.summary.workedMinutes)} min · travel {s.summary.travelMinutes} · hub {s.summary.hubMinutes} · customer{" "}
                        {s.summary.customerMinutes} · vendor {s.summary.vendorMinutes} · {s.summary.distanceKm} km · {s.summary.tasksCompleted} jobs
                      </Muted>
                      {s.overrideReason ? <Muted>Override: {s.overrideReason}</Muted> : null}
                    </View>
                    <Button compact label="Trail" variant="ghost" onPress={() => void showTrail(s.id)} />
                  </View>
                ))}
                {trail ? (
                  <MiniMap
                    height={260}
                    markers={trail.points.length ? [
                      { id: "start", label: "Start", color: colors.success, point: trail.points[0] },
                      { id: "end", label: "Last", color: colors.danger, point: trail.points[trail.points.length - 1] },
                    ] : []}
                    paths={[{ id: "trail", color: colors.primary, points: trail.points }]}
                    emptyMessage="No GPS points recorded for this shift"
                  />
                ) : null}
                <Text style={styles.h2}>Tasks</Text>
                {data.tasks.slice(0, 15).map((t) => (
                  <View key={t.id} style={styles.subRow}>
                    <Text style={[styles.rowTitle, { flex: 1 }]}>
                      {t.taskCode} · {t.title}
                    </Text>
                    <StateBadge state={t.state} />
                  </View>
                ))}
                <Text style={styles.h2}>Failed attempts</Text>
                {data.failures.length ? data.failures.map((f) => <Muted key={f.at}>{ist(f.at)} · {f.taskId} · {f.label} {f.notes ? `— ${f.notes}` : ""}</Muted>) : <Muted>None</Muted>}
                <Text style={styles.h2}>Onboarding visits</Text>
                {data.onboardingVisits.length ? data.onboardingVisits.map((v) => <Muted key={v.id}>{ist(v.visitedAt)} · {v.partner?.businessName} · {v.visitStatus} · GST {v.gstAvailable ? v.gstNumber : "no"}</Muted>) : <Muted>None</Muted>}
                <Text style={styles.h2}>Inventory movements</Text>
                {data.inventoryMovements.length ? data.inventoryMovements.map((m) => <Muted key={m.id}>{ist(m.at)} · {m.serial} · {m.movementType} · {m.from.type} → {m.to.type} · {m.condition}</Muted>) : <Muted>None</Muted>}
                <Text style={styles.h2}>Audit</Text>
                {data.audit.slice(0, 25).map((a) => (
                  <Muted key={a.id}>
                    {ist(a.at)} · {a.action} · {a.entityType}:{a.entityId}
                  </Muted>
                ))}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Rosters ──────────────────────────────────────────────────────────────────

type DraftStop = { key: string; stopType: string; name: string; lat: number; lng: number; taskId?: string; windowStart?: string; windowEnd?: string };

function istDate(offsetDays: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

function Rosters({ employees, hubs }: { employees: FeState[]; hubs: Hub[] }) {
  const { get, send } = useApp();
  const [fe, setFe] = useState<string | null>(null);
  const [day, setDay] = useState<0 | 1>(0);
  const [start, setStart] = useState("09:30");
  const [end, setEnd] = useState("18:30");
  const [hub, setHub] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stops, setStops] = useState<DraftStop[]>([]);
  const [existing, setExisting] = useState<Roster | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!fe) return;
    void (async () => {
      const detail = await get<EmployeeDetail>(`${OPS}/manager/employees/${fe}`);
      if (!detail.ok) return;
      setTasks(detail.body.tasks.filter((t) => !["COMPLETED", "CANCELLED"].includes(t.state) && t.stop));
      const roster = day === 0 ? detail.body.rosterToday : detail.body.rosterTomorrow;
      setExisting(roster);
      if (roster.published) {
        setStart(roster.shiftStart ?? "09:30");
        setEnd(roster.shiftEnd ?? "18:30");
        setHub(roster.hub?.id ?? null);
        setStops(roster.stops.map((s) => ({ key: s.id, stopType: s.type, name: s.name, lat: s.lat, lng: s.lng, taskId: s.task?.id, windowStart: s.windowStart ?? undefined, windowEnd: s.windowEnd ?? undefined })));
      } else {
        setStops([]);
      }
    })();
  }, [fe, day, get]);

  async function publish() {
    setBusy(true);
    const res = await send(
      `${OPS}/manager/rosters`,
      {
        employeeId: fe,
        date: istDate(day),
        shiftStart: start,
        shiftEnd: end,
        hubId: hub ?? undefined,
        stops: stops.map((s) => ({ stopType: s.stopType, name: s.name, lat: s.lat, lng: s.lng, taskId: s.taskId, windowStart: s.windowStart, windowEnd: s.windowEnd })),
      },
      "PUT",
    );
    setBusy(false);
    Alert.alert(res.ok ? "Roster published — the FE has been notified." : `Not published: ${res.message}`);
  }

  const move = (index: number, delta: number) =>
    setStops((s) => {
      const next = [...s];
      const [row] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, row);
      return next;
    });

  return (
    <View style={{ gap: 12 }}>
      <Heading title="Rosters & journey plans" subtitle="Publish an ordered beat plan. The FE's first stop drives the 5 km clock-in rule." />
      <Text style={styles.label}>Field executive</Text>
      <ChipWrap>
        {employees.map((e) => (
          <Chip key={e.employee.id} label={e.employee.displayName} selected={fe === e.employee.id} onPress={() => setFe(e.employee.id)} />
        ))}
      </ChipWrap>
      <ChipWrap>
        <Chip label={`Today ${istDate(0)}`} selected={day === 0} onPress={() => setDay(0)} />
        <Chip label={`Tomorrow ${istDate(1)}`} selected={day === 1} onPress={() => setDay(1)} />
      </ChipWrap>
      {fe ? (
        <Card>
          <Muted>{existing?.published ? `Current version v${existing.version}, updated ${ist(existing.updatedAt)}` : "No roster published for this day yet."}</Muted>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label="Shift start (HH:MM)" value={start} onChangeText={setStart} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Shift end (HH:MM)" value={end} onChangeText={setEnd} />
            </View>
          </View>
          <ChipWrap>
            {hubs.map((h) => (
              <Chip key={h.id} label={h.name} selected={hub === h.id} onPress={() => setHub(h.id)} />
            ))}
          </ChipWrap>
          <Text style={styles.h2}>Stops in order</Text>
          {stops.map((s, i) => (
            <View key={s.key} style={styles.subRow}>
              <Text style={[styles.rowTitle, { flex: 1 }]}>
                {i + 1}. {s.name} · {s.stopType}
                {s.taskId ? ` · ${s.taskId}` : ""}
              </Text>
              <TextInput
                accessibilityLabel="Window start"
                placeholder="10:00"
                value={s.windowStart ?? ""}
                onChangeText={(v) => setStops((all) => all.map((x) => (x.key === s.key ? { ...x, windowStart: v || undefined } : x)))}
                style={styles.smallInput}
              />
              <TextInput
                accessibilityLabel="Window end"
                placeholder="11:00"
                value={s.windowEnd ?? ""}
                onChangeText={(v) => setStops((all) => all.map((x) => (x.key === s.key ? { ...x, windowEnd: v || undefined } : x)))}
                style={styles.smallInput}
              />
              <Button compact label="↑" variant="ghost" onPress={() => move(i, -1)} />
              <Button compact label="↓" variant="ghost" onPress={() => move(i, 1)} />
              <Button compact label="✕" variant="danger" onPress={() => setStops((all) => all.filter((x) => x.key !== s.key))} />
            </View>
          ))}
          <Text style={styles.label}>Add the FE's open jobs</Text>
          <ChipWrap>
            {tasks
              .filter((t) => !stops.some((s) => s.taskId === t.id))
              .map((t) => (
                <Chip
                  key={t.id}
                  label={`${t.taskCode} · ${t.stop?.name ?? t.title}`}
                  onPress={() =>
                    setStops((s) => [...s, { key: t.id, stopType: t.stop?.type ?? "CUSTOMER", name: t.stop?.name ?? t.title, lat: t.stop!.lat, lng: t.stop!.lng, taskId: t.id }])
                  }
                />
              ))}
          </ChipWrap>
          <Text style={styles.label}>Add a hub stop</Text>
          <ChipWrap>
            {hubs.map((h) => (
              <Chip key={h.id} label={`+ ${h.name}`} onPress={() => setStops((s) => [...s, { key: `${h.id}-${Date.now()}`, stopType: "HUB", name: h.name, lat: h.lat, lng: h.lng }])} />
            ))}
          </ChipWrap>
          <Button label={busy ? "Publishing…" : "Publish roster"} disabled={busy} onPress={() => void publish()} />
        </Card>
      ) : null}
    </View>
  );
}

// ── Onboarding ───────────────────────────────────────────────────────────────

function Onboarding({ employees }: { employees: FeState[] }) {
  const { data } = usePolling<{ visits: OnboardingVisit[]; byStatus: Record<string, number> }>(`${OPS}/manager/onboarding?limit=200`, 60_000);
  const names = new Map(employees.map((e) => [e.employee.id, e.employee.displayName]));
  return (
    <View style={{ gap: 12 }}>
      <Heading title="Partner onboarding" subtitle="Studios, freelancers, videographers, album designers, editors, LED-wall & WebLive partners" />
      <View style={styles.metrics}>
        {["INTERESTED", "NEED_TIME", "FOLLOW_UP", "ONBOARDED", "NOT_INTERESTED"].map((s) => (
          <Metric key={s} label={s.replace("_", " ")} value={data?.byStatus[s] ?? 0} tone={s === "ONBOARDED" ? "green" : undefined} />
        ))}
      </View>
      {(data?.visits ?? []).map((v) => (
        <View key={v.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>
              {v.partner?.businessName} · {v.partner?.partnerTypeLabel}
            </Text>
            <Muted>
              {v.partner?.contactPerson} {v.partner?.phone ? `· ${v.partner.phone}` : ""} · by {names.get(v.employeeId) ?? v.employeeId} · {ist(v.visitedAt)}
            </Muted>
            <Muted>
              GST: {v.gstAvailable ? v.gstNumber : "not registered"}
              {v.nextMeetingAt ? ` · next meeting ${ist(v.nextMeetingAt)}` : ""}
              {v.notes ? ` · ${v.notes}` : ""}
            </Muted>
          </View>
          <Badge label={v.visitStatus.replace("_", " ")} tone={v.visitStatus === "ONBOARDED" ? "green" : v.visitStatus === "NOT_INTERESTED" ? "red" : "peach"} />
        </View>
      ))}
    </View>
  );
}

// ── Approvals ────────────────────────────────────────────────────────────────

function Approvals({ employees }: { employees: FeState[] }) {
  const { send } = useApp();
  const leave = usePolling<{ leave_requests: { id: string; userId: string; type: string; from: string; to: string; days: number; reason: string | null; status: string }[] }>(`${OPS}/leave`, 60_000);
  const expenses = usePolling<{ expenses: { id: string; userId: string; amountInr: number; note: string | null; date: string; km: number | null; status: string }[] }>(`${OPS}/expenses`, 60_000);
  const names = new Map(employees.map((e) => [e.employee.id, e.employee.displayName]));
  async function review(path: string, status: "approved" | "rejected", reload: () => Promise<void>) {
    const res = await send(path, { status });
    if (!res.ok) Alert.alert(res.message);
    await reload();
  }
  const pendingLeave = (leave.data?.leave_requests ?? []).filter((l) => l.status === "pending");
  const pendingExp = (expenses.data?.expenses ?? []).filter((e) => e.status === "submitted" || e.status === "pending");
  return (
    <View style={{ gap: 12 }}>
      <Heading title="Approvals" subtitle="Leave and travel expense requests" />
      <Text style={styles.h2}>Leave</Text>
      {pendingLeave.length === 0 ? <Muted>No pending leave.</Muted> : null}
      {pendingLeave.map((l) => (
        <View key={l.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>
              {names.get(l.userId) ?? l.userId} · {l.type} · {l.days} day(s)
            </Text>
            <Muted>
              {l.from} → {l.to} {l.reason ? `· ${l.reason}` : ""}
            </Muted>
          </View>
          <Button compact label="Reject" variant="ghost" onPress={() => void review(`${OPS}/leave/${l.id}/review`, "rejected", leave.reload)} />
          <Button compact label="Approve" onPress={() => void review(`${OPS}/leave/${l.id}/review`, "approved", leave.reload)} />
        </View>
      ))}
      <Text style={styles.h2}>Expenses</Text>
      {pendingExp.length === 0 ? <Muted>No pending expenses.</Muted> : null}
      {pendingExp.map((e) => (
        <View key={e.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>
              {names.get(e.userId) ?? e.userId} · ₹{e.amountInr}
            </Text>
            <Muted>
              {e.date} · {e.km ?? 0} km · {e.note}
            </Muted>
          </View>
          <Button compact label="Reject" variant="ghost" onPress={() => void review(`${OPS}/expenses/${e.id}/review`, "rejected", expenses.reload)} />
          <Button compact label="Approve" onPress={() => void review(`${OPS}/expenses/${e.id}/review`, "approved", expenses.reload)} />
        </View>
      ))}
    </View>
  );
}

// ── SOS & audit ──────────────────────────────────────────────────────────────

function SosAudit({ employees }: { employees: FeState[] }) {
  const { send } = useApp();
  const sos = usePolling<{ events: { id: string; employeeId: string; lat: number | null; lng: number | null; accuracyM: number | null; managerId: string | null; distanceKm: number | null; status: string; at: string }[] }>(`${OPS}/manager/sos`, 15_000);
  const audit = usePolling<{ audit: { id: string; actorId: string | null; action: string; entityType: string; entityId: string | null; at: string }[] }>(`${OPS}/manager/audit?limit=100`, 60_000);
  const names = new Map(employees.map((e) => [e.employee.id, e.employee.displayName]));
  return (
    <View style={{ gap: 12 }}>
      <Heading title="SOS & audit trail" />
      {(sos.data?.events ?? []).map((e) => (
        <View key={e.id} style={[styles.row, e.status === "OPEN" && styles.rowRed]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>
              SOS · {names.get(e.employeeId) ?? e.employeeId} · {ist(e.at)}
            </Text>
            <Muted>
              {e.lat !== null ? `${e.lat.toFixed(5)}, ${e.lng?.toFixed(5)} ±${Math.round(e.accuracyM ?? 0)} m` : "No GPS recorded"} · routed to {e.managerId ? names.get(e.managerId) ?? e.managerId : "—"}
              {e.distanceKm !== null ? ` (${e.distanceKm} km)` : ""}
            </Muted>
          </View>
          {e.status === "OPEN" ? (
            <Button compact label="Resolve" onPress={() => void send(`${OPS}/manager/sos/${e.id}/resolve`, {}).then(() => sos.reload())} />
          ) : (
            <Badge label="Resolved" tone="green" />
          )}
        </View>
      ))}
      {sos.data && sos.data.events.length === 0 ? <Muted>No SOS events.</Muted> : null}
      <Text style={styles.h2}>Audit trail (immutable)</Text>
      {(audit.data?.audit ?? []).map((a) => (
        <Muted key={a.id}>
          {ist(a.at)} · {a.actorId ? names.get(a.actorId) ?? a.actorId : "system"} · {a.action} · {a.entityType}:{a.entityId ?? ""}
        </Muted>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg },
  sidebar: { width: 240, backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.peachBorder, padding: 16, gap: 16 },
  topnav: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.peachBorder, paddingVertical: 8 },
  mobileHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, backgroundColor: colors.white },
  brand: { flexDirection: "row", gap: 10, alignItems: "center" },
  brandTitle: { fontSize: 18, fontWeight: "900", color: colors.ink },
  navItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  navChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.cream },
  navActive: { backgroundColor: colors.primary },
  navText: { fontWeight: "700", color: colors.ink },
  navTextActive: { color: colors.white },
  main: { padding: 20, gap: 16, maxWidth: 1200, width: "100%", alignSelf: "center" },
  heading: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  h1: { fontSize: 22, fontWeight: "900", color: colors.ink },
  h2: { fontSize: 15, fontWeight: "800", color: colors.ink, marginTop: 6 },
  label: { fontSize: 13, fontWeight: "700", color: colors.ink },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { flexGrow: 1, minWidth: 140, backgroundColor: colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.peachBorder },
  metricRed: { borderColor: colors.danger, backgroundColor: "#FFF5F5" },
  metricValue: { fontSize: 28, fontWeight: "900", color: colors.ink },
  metricLabel: { fontSize: 12, fontWeight: "700", color: colors.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.white, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.peachBorder, flexWrap: "wrap" },
  rowRed: { borderColor: colors.danger, borderWidth: 2, backgroundColor: "#FFF5F5" },
  rowSelected: { borderColor: colors.primary, borderWidth: 2 },
  rowTitle: { fontWeight: "800", color: colors.ink, fontSize: 14 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.peach, flexWrap: "wrap" },
  badgeCol: { gap: 4, alignItems: "flex-end" },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sosAlert: { backgroundColor: colors.danger, padding: 14, borderRadius: 12 },
  sosAlertText: { color: colors.white, fontWeight: "900" },
  backdrop: { flex: 1, backgroundColor: "rgba(17,24,39,0.45)", alignItems: Platform.OS === "web" ? "flex-end" : "stretch", justifyContent: "center" },
  drawer: { backgroundColor: colors.bg, width: "100%", maxWidth: 720, height: "100%" },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumb: { width: 120, height: 120, borderRadius: 10, backgroundColor: colors.peach },
  signature: { height: 110, width: 300, backgroundColor: colors.white, borderRadius: 8 },
  smallInput: { width: 64, borderWidth: 1, borderColor: colors.peachBorder, borderRadius: 8, padding: 6, backgroundColor: colors.white },
});
