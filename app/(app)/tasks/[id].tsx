import { useCallback, useEffect, useState } from "react";
import { Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, CircleCheck, ClipboardCheck, Clock, MapPin, PenLine, RefreshCw } from "lucide-react-native";
import { Badge, Button, Card, Columns, EmptyState, ErrorState, Field, IconCircle, Muted, SectionHeader, StickyFooter } from "@/components/ui";
import { Chip, ChipWrap, StepRow } from "@/components/chips";
import { showDialog } from "@/components/dialog";
import { NavigateButton } from "@/components/navigate-button";
import { GeoCamera } from "@/components/geo-camera";
import { SignaturePad } from "@/components/signature-pad";
import { GpsLine, KindBadge, SlaBadge, StateBadge, kindIcon, useT, useTick } from "@/components/status";
import { colors, radii, space, type } from "@/constants/theme";
import { useLayout } from "@/lib/responsive";
import { useApp, type ActionResult } from "@/lib/app-context";
import { clockOffsetMs, KIT_KINDS, nextStep, projectTask, slaView, type Step } from "@/lib/field-ops";
import { formatKm, haversineKm } from "@/lib/geo";
import { errorText, type I18nKey } from "@/lib/i18n";
import type { CapturedImage } from "@/lib/media-store";
import { backToJobs } from "@/lib/nav";
import { mediaUrl } from "@/lib/ops-api";
import { signatureDataUri, type Pt } from "@/lib/signature-png";
import type { FailureCode, KitGrade, TaskDetail } from "@/lib/types";

const GRADES: KitGrade[] = ["GOOD", "SCUFF", "DENT", "MISSING"];

export default function JobDetailScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(raw) ? raw[0] : raw;
  const app = useApp();
  const tr = useT();
  const l = useLayout();
  useTick(30_000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lateReason, setLateReason] = useState("");

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await app.loadTask(id);
    setLoading(false);
    setError(res.ok ? null : res.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, app.loadTask]);

  useEffect(() => {
    void reload();
  }, [reload, app.online]);

  const server = id ? app.task(id) : null;
  if (!server) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg }}>
        {error ? <ErrorState message={error} onRetry={() => void reload()} retryLabel={tr("retry")} /> : <EmptyState icon={Clock} title={tr("loading")} />}
      </View>
    );
  }

  const queued = app.pendingForTask(server.id);
  const { task, pendingSteps } = projectTask(server, queued);
  const step = nextStep(task, task.evidence);
  const lang = app.language;

  const report = (r: ActionResult, okText?: string) => {
    // A second tap on a step that is already queued is harmless: no dialog. Other local refusals (GPS, late
    // reason, full queue) are explained, but never labelled as a server rejection.
    if (!r.ok && r.code === "ALREADY_QUEUED") return;
    if (!r.ok) showDialog(tr("actionBlocked"), errorText(lang, r.code, r.message));
    else if (r.queued) showDialog(tr("pendingSync"), tr("queuedOffline"));
    else if (okText) showDialog(okText);
  };

  const nextTaskId = app.home?.nextTask && app.home.nextTask.id !== task.id ? app.home.nextTask.id : null;
  const offset = clockOffsetMs(server.serverTime);
  const breached =
    slaView(server.sla, offset, app.config?.rules.slaAtRiskMin ?? 45, Date.now(), server.state === "COMPLETED").status === "BREACHED";
  const radius = app.config?.rules.checkInRadiusM ?? 150;
  const distanceKm = app.live && task.stop ? haversineKm(app.live, task.stop) : null;

  function primary() {
    const map: Partial<Record<Step, () => ActionResult>> = {
      START_ROUTE: () => app.enRoute(task.id),
      ARRIVE: () => app.arrived(task.id),
      CHECK_IN: () => app.checkIn(task.id),
      START_WORK: () => app.startTask(task.id),
      COMPLETE: () => {
        if (breached && lateReason.trim().length < 5) {
          return { ok: false, code: "LATE_REASON_REQUIRED", message: tr("lateReasonHint") };
        }
        return app.completeTask(task.id, breached ? lateReason.trim() : undefined);
      },
    };
    if (step === "DONE" || step === "CANCELLED") {
      // Next operational job (server-ordered on Home), else the job list.
      if (nextTaskId) router.replace(`/(app)/tasks/${encodeURIComponent(nextTaskId)}`);
      else backToJobs();
      return;
    }
    const run = map[step];
    if (run) report(run());
  }

  const stepList: { key: string; label: string; done: boolean }[] = [
    { key: "check-in", label: tr("step_CHECK_IN"), done: ["CHECKED_IN", "IN_PROGRESS", "COMPLETED"].includes(task.state) },
    ...(KIT_KINDS.has(task.kind)
      ? [
          { key: "verify-serial", label: tr("step_SERIALS"), done: task.items.length > 0 && task.items.every((i) => i.serialVerified) },
          {
            key: "kit-condition",
            label: tr("step_KIT"),
            done: task.items.length > 0 && task.items.every((i) => task.evidence.kitConditions.some((k) => k.itemId === i.itemId)),
          },
        ]
      : []),
    { key: "photos", label: tr("step_PHOTO"), done: task.evidence.photos.some((p) => p.attemptNo === task.attemptNo) },
    ...(task.evidence.pinRequired ? [{ key: "pin", label: tr("step_PIN"), done: task.evidence.pin?.state === "VERIFIED" }] : []),
    ...(task.evidence.podRequired ? [{ key: "pod", label: tr("step_POD"), done: Boolean(task.evidence.pod) }] : []),
  ];
  const firstOpen = stepList.find((s) => !s.done)?.key;

  const active = ["CHECKED_IN", "IN_PROGRESS"].includes(task.state);
  const closed = task.state === "COMPLETED" || task.state === "CANCELLED";
  const failedItems = queued.filter((q) => q.status === "FAILED");
  const primaryDisabled = ["SERIALS", "KIT", "PHOTO", "PIN", "POD"].includes(step) || (step === "COMPLETE" && pendingSteps.has("complete"));
  const primaryLabel = pendingSteps.has("complete")
    ? tr("pendingSync")
    : step === "DONE" || step === "CANCELLED"
      ? nextTaskId
        ? tr("nextJob")
        : tr("backToJobs")
      : tr(`step_${step}` as I18nKey);
  const why = primaryDisabled && !pendingSteps.has("complete") ? tr(`why_${step}` as I18nKey) : null;

  const action = (
    <>
      {why ? <Text style={styles.why}>{why}</Text> : null}
      <Button label={primaryLabel} disabled={primaryDisabled} onPress={primary} icon={step === "DONE" || step === "CANCELLED" ? ArrowRight : undefined} />
    </>
  );

  const progress = <JobProgress state={task.state} step={step} />;

  const checklist = !closed ? (
    <Card>
      <SectionHeader title={tr("checklist")} icon={ClipboardCheck} />
      {stepList.map((s) => (
        <StepRow key={s.key} label={`${s.label}${pendingSteps.has(s.key) ? ` · ${tr("pendingSync")}` : ""}`} done={s.done} current={s.key === firstOpen && active} />
      ))}
    </Card>
  ) : null;

  const main = (
    <>
      {failedItems.map((q) => (
        <View key={q.id} style={styles.failBox} accessibilityRole="alert">
          <Text style={styles.failTitle}>
            {tr("rejected")} · {q.label}
          </Text>
          <Text style={styles.failText}>{errorText(lang, q.lastCode, q.lastError ?? "")}</Text>
          <View style={styles.row}>
            <Button compact flex={1} label={tr("retry")} variant="secondary" icon={RefreshCw} onPress={() => app.retryQueued(q.id)} />
            <Button compact flex={1} label={tr("discard")} variant="ghost" onPress={() => app.discardQueued(q.id)} />
          </View>
        </View>
      ))}

      {/* Header */}
      <View style={styles.head}>
        <IconCircle icon={kindIcon(task.kind)} tone={closed ? "green" : "peach"} size={52} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={styles.title}>{task.title}</Text>
          <Text style={styles.code}>{task.taskCode}</Text>
          <View style={styles.badges}>
            <KindBadge kind={task.kind} />
            <StateBadge state={task.state} />
            <SlaBadge sla={server.sla} serverTime={server.serverTime} completed={server.state === "COMPLETED"} />
            {task.attemptNo > 1 ? <Badge label={tr("attempt", { n: task.attemptNo })} tone="violet" /> : null}
            {pendingSteps.size ? <Badge label={tr("pendingSync")} tone="blue" dot /> : null}
          </View>
        </View>
      </View>

      {task.state === "COMPLETED" ? (
        <Card tone="success">
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <CircleCheck size={28} color={colors.successInk} />
            <View style={{ flex: 1 }}>
              <Text style={[type.heading, { color: colors.successInk }]}>{tr("jobCompletedTitle")}</Text>
              <Text style={type.meta}>{nextTaskId ? tr("jobCompletedNext") : tr("jobCompletedNone")}</Text>
            </View>
          </View>
        </Card>
      ) : null}

      {/* Main column at every width: compact on phones, the full stepper where it fits. */}
      {progress}

      {!closed ? <GpsLine /> : null}

      {/* Stop + location verification */}
      <Card>
        <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
          <IconCircle icon={MapPin} tone="slate" size={36} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={type.heading}>{task.stop?.name ?? task.customerName}</Text>
            <Text style={type.meta}>
              {task.stop?.type ? `${tr(`stop_${task.stop.type}` as I18nKey)} · ` : ""}
              {task.stop?.address ?? task.area ?? ""}
            </Text>
          </View>
        </View>
        {task.evidence.checkIn ? (
          <Badge label={tr("evidenceCheckIn", { d: task.evidence.checkIn.distanceM })} tone="green" icon={CircleCheck} />
        ) : distanceKm !== null && !closed ? (
          <Badge
            label={tr("distanceToStop", { d: formatKm(distanceKm), r: radius })}
            tone={distanceKm * 1000 <= radius ? "green" : "amber"}
            icon={MapPin}
          />
        ) : null}
        <View style={styles.row}>
          {!closed ? <NavigateButton flex={1} dest={task.stop ? { ...task.stop, address: task.stop.address ?? task.area } : { address: task.area }} /> : null}
          {task.customerPhone ? (
            <Button flex={1} label={tr("callCustomer")} variant="ghost" onPress={() => void Linking.openURL(`tel:${task.customerPhone}`)} />
          ) : null}
        </View>
        {task.notes ? <Text style={type.meta}>{task.notes}</Text> : null}
      </Card>

      {!l.twoCol ? checklist : null}

      {KIT_KINDS.has(task.kind) && task.items.length ? <KitSection task={task} enabled={active} report={report} /> : null}

      {active ? <PhotoSection task={task} report={report} /> : <PhotoList task={task} />}

      {task.evidence.pinRequired && active ? <PinSection task={server} /> : null}

      {task.evidence.podRequired && active && !task.evidence.pod && task.evidence.pin?.state === "VERIFIED" ? (
        <PodSection task={task} report={report} />
      ) : null}
      {task.evidence.pod?.signatureUrl ? (
        <Card>
          <SectionHeader title={tr("signatureSaved")} icon={PenLine} />
          <Text style={type.meta}>{task.evidence.pod.recipientName}</Text>
          <Image source={{ uri: mediaUrl(task.evidence.pod.signatureUrl)! }} style={styles.signature} resizeMode="contain" />
        </Card>
      ) : null}

      {step === "COMPLETE" && breached ? (
        <Card tone="warning">
          <Text style={type.heading}>{tr("lateReason")}</Text>
          <Text style={type.meta}>{tr("lateReasonHint")}</Text>
          <Field label={tr("lateReason")} value={lateReason} onChangeText={setLateReason} multiline />
        </Card>
      ) : null}

      {step === "RETRY" ? <RetrySection task={task} report={report} /> : null}
      {["EN_ROUTE", "ARRIVED", "CHECKED_IN", "IN_PROGRESS", "ASSIGNED", "RETRY"].includes(task.state) ? (
        <FailSection task={task} report={report} />
      ) : null}

      {task.evidence.failures.length ? (
        <Card tone="muted">
          <Text style={type.heading}>{tr("failAttempt")}</Text>
          {task.evidence.failures.map((f) => (
            <Text key={f.at} style={type.meta}>
              {tr("attempt", { n: f.attemptNo })} · {tr(`failure_${f.code}` as I18nKey)}
              {f.notes ? ` · ${f.notes}` : ""}
            </Text>
          ))}
        </Card>
      ) : null}

      <Card tone="muted">
        <SectionHeader title={tr("timeline")} icon={Clock} />
        {server.timeline.map((e) => (
          <View key={e.id} style={styles.event}>
            <View style={styles.eventDot} />
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontSize: 14 }]}>{e.label}</Text>
              <Text style={type.caption}>{new Date(e.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</Text>
            </View>
          </View>
        ))}
      </Card>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: l.pad, paddingTop: space.lg, paddingBottom: l.twoCol ? space.xxl : 170 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
      >
        <View style={{ width: "100%", maxWidth: l.maxWidth, alignSelf: "center" }}>
          <Columns
            main={main}
            side={
              /* Desktop/tablet only: phones show the checklist inline and the action in the sticky footer. */
              l.twoCol ? (
                <>
                  {checklist}
                  <Card elevated>{action}</Card>
                </>
              ) : null
            }
          />
        </View>
      </ScrollView>

      {/* Phones: sticky primary action */}
      {!l.twoCol ? <StickyFooter>{action}</StickyFooter> : null}
    </View>
  );
}

/** Visual progress: route → arrived → check-in → work → proof → complete. Current step highlighted. */
function JobProgress({ state, step }: { state: string; step: Step }) {
  const tr = useT();
  const stages = [tr("stage_route"), tr("stage_arrived"), tr("stage_checkin"), tr("stage_work"), tr("stage_proof"), tr("stage_complete")];
  const current =
    state === "COMPLETED"
      ? stages.length
      : state === "EN_ROUTE"
        ? 1
        : state === "ARRIVED"
          ? 2
          : state === "CHECKED_IN"
            ? 3
            : state === "IN_PROGRESS"
              ? step === "COMPLETE"
                ? 5
                : 4
              : 0;
  // Every label only fits when each stage gets ~64 px; otherwise name just the current stage.
  const [width, setWidth] = useState(0);
  const compact = width > 0 && width / stages.length < 64;
  return (
    <Card padding={space.md}>
      <View
        style={styles.progress}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="progressbar"
        accessibilityLabel={stages[Math.min(current, stages.length - 1)]}
        accessibilityValue={{ min: 0, max: stages.length, now: current }}
      >
        {stages.map((label, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <View key={label} style={styles.stage}>
              <View style={styles.stageTrack}>
                <View style={[styles.stageBar, done && { backgroundColor: colors.success }, now && { backgroundColor: colors.primary }]} />
              </View>
              {!compact ? (
                <Text style={[styles.stageLabel, done && { color: colors.successInk }, now && { color: colors.primaryDark, fontWeight: "800" }]} numberOfLines={2}>
                  {label}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      {compact ? (
        <Text style={[type.caption, { color: current >= stages.length ? colors.successInk : colors.primaryDark, fontWeight: "800" }]}>
          {Math.min(current + 1, stages.length)}/{stages.length} · {stages[Math.min(current, stages.length - 1)]}
        </Text>
      ) : null}
    </Card>
  );
}

type Report = (r: ActionResult, okText?: string) => void;

function KitSection({ task, enabled, report }: { task: TaskDetail; enabled: boolean; report: Report }) {
  const app = useApp();
  const tr = useT();
  const [last4, setLast4] = useState<Record<string, string>>({});
  const [grade, setGrade] = useState<Record<string, KitGrade>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, CapturedImage[]>>({});
  return (
    <Card>
      <Text style={styles.h}>{tr("kitOnTask")}</Text>
      {task.items.map((item) => {
        const graded = task.evidence.kitConditions.find((k) => k.itemId === item.itemId);
        const g = grade[item.itemId] ?? "GOOD";
        return (
          <View key={item.itemId} style={styles.item}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Muted>
              {item.sku} · {item.serial}
            </Muted>
            {item.serialVerified ? (
              <Badge label={tr("serialOk")} tone="green" />
            ) : enabled ? (
              <>
                <Muted>{tr("serialHint")}</Muted>
                <View style={styles.row}>
                  <TextInput
                    accessibilityLabel={tr("last4")}
                    value={last4[item.itemId] ?? ""}
                    onChangeText={(v) => setLast4((s) => ({ ...s, [item.itemId]: v.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() }))}
                    placeholder={tr("last4")}
                    autoCapitalize="characters"
                    maxLength={4}
                    style={[styles.input, { flex: 1, letterSpacing: 6, fontSize: 20 }]}
                  />
                  <Button
                    flex={1}
                    label={tr("matchSerial")}
                    disabled={(last4[item.itemId] ?? "").length !== 4}
                    onPress={() => report(app.verifySerial(task.id, item.itemId, last4[item.itemId]!))}
                  />
                </View>
              </>
            ) : null}
            {graded ? (
              <Badge label={`${tr("condition")}: ${tr(`grade_${graded.grade}` as I18nKey)}`} tone={graded.grade === "GOOD" ? "green" : "red"} />
            ) : enabled && item.serialVerified ? (
              <>
                <Text style={styles.sub}>{tr("condition")}</Text>
                <ChipWrap>
                  {GRADES.map((gr) => (
                    <Chip
                      key={gr}
                      label={tr(`grade_${gr}` as I18nKey)}
                      selected={g === gr}
                      tone={gr === "GOOD" ? "default" : "danger"}
                      onPress={() => setGrade((s) => ({ ...s, [item.itemId]: gr }))}
                    />
                  ))}
                </ChipWrap>
                {g !== "GOOD" ? (
                  <>
                    <Field
                      label={tr("damageNotes")}
                      value={notes[item.itemId] ?? ""}
                      onChangeText={(v) => setNotes((s) => ({ ...s, [item.itemId]: v }))}
                      multiline
                    />
                    <GeoCamera
                      label={tr("damagePhoto")}
                      onCaptured={(img) => setPhotos((s) => ({ ...s, [item.itemId]: [...(s[item.itemId] ?? []), img] }))}
                    />
                  </>
                ) : null}
                <Button
                  label={tr("saveCondition")}
                  disabled={g !== "GOOD" && ((notes[item.itemId] ?? "").trim().length < 3 || !(photos[item.itemId] ?? []).length)}
                  onPress={() => report(app.recordKit(task.id, item.itemId, g, notes[item.itemId] ?? "", photos[item.itemId] ?? []))}
                />
              </>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

function PhotoList({ task }: { task: TaskDetail }) {
  const tr = useT();
  const shown = task.evidence.photos.filter((p) => p.url);
  if (!shown.length) return null;
  return (
    <Card accent={false}>
      <Text style={styles.h}>{tr("photos")}</Text>
      <View style={styles.thumbs}>
        {shown.map((p) => (
          <Image key={p.id} source={{ uri: mediaUrl(p.url)! }} style={styles.thumb} />
        ))}
      </View>
    </Card>
  );
}

function PhotoSection({ task, report }: { task: TaskDetail; report: Report }) {
  const app = useApp();
  const tr = useT();
  const [checkpoint, setCheckpoint] = useState("");
  const current = task.evidence.photos.filter((p) => p.attemptNo === task.attemptNo);
  return (
    <Card>
      <Text style={styles.h}>{tr("photos")}</Text>
      <Field label={tr("checkpoint")} value={checkpoint} onChangeText={setCheckpoint} />
      <GeoCamera
        label={tr("addPhoto")}
        onCaptured={(img) => {
          report(app.addPhoto(task.id, checkpoint.trim() || tr(`kind_${task.kind}` as I18nKey), img));
          setCheckpoint("");
        }}
      />
      <View style={styles.thumbs}>
        {current.map((p) =>
          p.url ? (
            <Image key={p.id} source={{ uri: mediaUrl(p.url)! }} style={styles.thumb} />
          ) : (
            <View key={p.id} style={[styles.thumb, styles.pendingThumb]}>
              <Text style={styles.pendingText}>{tr("pendingSync")}</Text>
            </View>
          ),
        )}
      </View>
    </Card>
  );
}

function PinSection({ task }: { task: TaskDetail }) {
  const app = useApp();
  const tr = useT();
  // value is present only for IN_APP delivery; with WhatsApp the app never sees the PIN.
  const [pin, setPin] = useState<{ value?: string; sentTo?: string; expiresAt: string } | null>(null);
  const [mode, setMode] = useState<"show" | "enter">("show");
  const [entry, setEntry] = useState("");
  const [busy, setBusy] = useState(false);
  const state = task.evidence.pin?.state;

  if (state === "VERIFIED") {
    return (
      <Card>
        <Text style={styles.h}>{tr("pinTitle")}</Text>
        <Badge label={tr("pinVerified")} tone="green" />
      </Card>
    );
  }

  async function generate() {
    if (!app.online) return showDialog(tr("pinTitle"), tr("pinNeedsConnection"));
    setBusy(true);
    const res = await app.generatePin(task.id);
    setBusy(false);
    if (!res.ok) return showDialog(tr("pinTitle"), errorText(app.language, res.code, res.message));
    setPin({ value: res.body.pin, sentTo: res.body.sentTo, expiresAt: res.body.expiresAt });
    setMode(res.body.pin ? "show" : "enter");
    setEntry("");
  }

  async function verify() {
    if (!app.online) return showDialog(tr("pinTitle"), tr("pinNeedsConnection"));
    setBusy(true);
    const res = await app.verifyPin(task.id, entry);
    setBusy(false);
    setEntry("");
    if (!res.ok) return showDialog(tr("pinTitle"), errorText(app.language, res.code, res.message));
    if (res.body.verified) {
      setPin(null);
      showDialog(tr("pinVerified"));
    } else {
      showDialog(tr("pinTitle"), tr("pinWrong", { n: res.body.attemptsLeft ?? 0 }));
    }
  }

  return (
    <Card>
      <Text style={styles.h}>{tr("pinTitle")}</Text>
      {pin?.sentTo || (!pin && task.evidence.pinDelivery === "WHATSAPP" && state === "ACTIVE") ? (
        <Muted>{tr("pinSentWhatsApp", { to: pin?.sentTo ?? "" })}</Muted>
      ) : null}
      {!pin && !(task.evidence.pinDelivery === "WHATSAPP" && state === "ACTIVE") ? (
        <Button label={busy ? tr("saving") : tr("pinGenerate")} disabled={busy} onPress={() => void generate()} />
      ) : mode === "show" && pin?.value ? (
        <>
          <Text style={styles.pin}>{pin.value}</Text>
          <Muted>{tr("pinShow")}</Muted>
          <Muted>{tr("pinExpires", { time: new Date(pin.expiresAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) })}</Muted>
          <Button label={tr("pinCustomerTypes")} onPress={() => setMode("enter")} />
        </>
      ) : (
        <>
          <Muted>{tr("pinEnter")}</Muted>
          <TextInput
            accessibilityLabel={tr("pinEnter")}
            value={entry}
            onChangeText={(v) => setEntry(v.replace(/\D/g, "").slice(0, 4))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            style={[styles.input, styles.pinInput]}
          />
          <Button label={tr("pinVerify")} disabled={entry.length !== 4 || busy} onPress={() => void verify()} />
          <Button label={tr("pinGenerate")} variant="ghost" disabled={busy} onPress={() => void generate()} />
        </>
      )}
    </Card>
  );
}

function PodSection({ task, report }: { task: TaskDetail; report: Report }) {
  const app = useApp();
  const tr = useT();
  const [recipient, setRecipient] = useState(task.customerName ?? "");
  const [sig, setSig] = useState<{ strokes: Pt[][]; w: number; h: number } | null>(null);
  const png = sig ? signatureDataUri(sig.strokes, sig.w, sig.h) : null;
  return (
    <Card>
      <Text style={styles.h}>{tr("podTitle")}</Text>
      <Field label={tr("recipientName")} value={recipient} onChangeText={setRecipient} />
      <SignaturePad
        hint={tr("signHere")}
        clearLabel={tr("clearSignature")}
        onChange={(strokes, size) => setSig({ strokes, w: size.w, h: size.h })}
      />
      <Button
        label={tr("saveSignature")}
        disabled={!png || recipient.trim().length < 2}
        onPress={() => report(app.capturePod(task.id, recipient.trim(), png!))}
      />
    </Card>
  );
}

function FailSection({ task, report }: { task: TaskDetail; report: Report }) {
  const app = useApp();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<FailureCode | null>(null);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<CapturedImage[]>([]);
  const codes: FailureCode[] = (app.config?.failureCodes.map((f) => f.code) as FailureCode[] | undefined) ?? [
    "NSZ",
    "CUSTOMER_UNAVAILABLE",
    "KIT_REFUSED",
    "WEATHER",
    "VEHICLE",
    "ADDRESS",
  ];
  if (!open) return <Button label={tr("failAttempt")} variant="danger" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Text style={styles.h}>{tr("failAttempt")}</Text>
      <Text style={styles.sub}>{tr("failReason")}</Text>
      <ChipWrap>
        {codes.map((c) => (
          <Chip key={c} label={tr(`failure_${c}` as I18nKey)} tone="danger" selected={code === c} onPress={() => setCode(c)} />
        ))}
      </ChipWrap>
      <Field label={tr("failNotes")} value={notes} onChangeText={setNotes} multiline />
      <GeoCamera label={tr("addPhoto")} onCaptured={(img) => setPhotos((p) => [...p, img])} />
      <Button
        label={tr("failSubmit")}
        variant="danger"
        disabled={!code}
        onPress={() => {
          report(app.failTask(task.id, code!, notes.trim(), photos));
          setOpen(false);
        }}
      />
    </Card>
  );
}

function RetrySection({ task, report }: { task: TaskDetail; report: Report }) {
  const app = useApp();
  const tr = useT();
  const [reason, setReason] = useState("");
  return (
    <Card>
      <Text style={styles.h}>{tr("step_RETRY")}</Text>
      <Field label={tr("retryReason")} value={reason} onChangeText={setReason} />
      <Button label={tr("step_RETRY")} onPress={() => report(app.retryTask(task.id, reason.trim()))} />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  code: { fontSize: 13, fontWeight: "600", color: colors.muted, fontVariant: ["tabular-nums"] },
  why: { fontSize: 13, color: colors.warningInk, fontWeight: "700", textAlign: "center" },
  event: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", paddingVertical: 4 },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
  progress: { flexDirection: "row", gap: 6 },
  stage: { flex: 1, gap: 6, minWidth: 0 },
  stageTrack: { height: 6, borderRadius: 3, backgroundColor: "#F3EDE6", overflow: "hidden" },
  stageBar: { height: 6, borderRadius: 3, backgroundColor: "transparent" },
  stageLabel: { fontSize: 11, fontWeight: "600", color: colors.faint, textAlign: "center" },
  wrap: { padding: 16, gap: 12, paddingBottom: 140 },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink, letterSpacing: -0.4 },
  h: { fontSize: 16, fontWeight: "800", color: colors.ink },
  sub: { fontSize: 13, fontWeight: "800", color: colors.ink },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  item: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, padding: space.md, gap: space.sm, backgroundColor: colors.surfaceMuted },
  itemName: { fontSize: 15, fontWeight: "800", color: colors.ink },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radii.button, padding: 10, backgroundColor: colors.white, color: colors.ink },
  pin: { fontSize: 48, fontWeight: "900", letterSpacing: 14, color: colors.primaryDark, textAlign: "center", paddingVertical: 8 },
  pinInput: { fontSize: 32, letterSpacing: 16, textAlign: "center" },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: radii.sm, backgroundColor: colors.peach },
  pendingThumb: { alignItems: "center", justifyContent: "center", padding: 6 },
  pendingText: { fontSize: 11, fontWeight: "800", color: colors.primaryDark, textAlign: "center" },
  signature: { height: 120, backgroundColor: colors.white, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.line },
  sticky: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    paddingBottom: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.peachBorder,
  },
  failBox: { backgroundColor: colors.dangerBg, borderRadius: radii.md, padding: space.md, gap: 6 },
  failTitle: { fontWeight: "800", color: colors.dangerInk },
  failText: { color: colors.dangerInk },
});
