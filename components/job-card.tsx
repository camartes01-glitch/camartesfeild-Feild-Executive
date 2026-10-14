import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight, ChevronRight, MapPin } from "lucide-react-native";
import { Badge, IconCircle, Skeleton } from "@/components/ui";
import { JobArt, jobArt } from "@/components/brand-art";
import { KindBadge, SlaBadge, StateBadge, kindIcon, useT } from "@/components/status";
import { colors, elevation, radii, space, type } from "@/constants/theme";
import { nextStep } from "@/lib/field-ops";
import { formatKm } from "@/lib/geo";
import type { I18nKey } from "@/lib/i18n";
import type { Task } from "@/lib/types";

/**
 * Job card: status accent edge, job-type icon, title, job number, location, distance, state + SLA, and the next
 * action. The whole card is the tap target.
 */
export function JobCard({
  task,
  serverTime,
  distanceKm,
  pending,
  onPress,
  rich,
}: {
  task: Task;
  serverTime: string | null;
  distanceKm: number | null;
  pending: boolean;
  /** Kept for callers; the breach is shown by the SLA badge rather than the edge colour. */
  breached?: boolean;
  onPress: () => void;
  /** Wide layouts: photographic job-type artwork, distance pill and the detailed "Next" footer. */
  rich?: boolean;
}) {
  const tr = useT();
  const done = task.state === "COMPLETED" || task.state === "CANCELLED";
  // List rows carry no evidence, so once work has started the exact proof step is shown on the job itself.
  const nextLabel = task.state === "IN_PROGRESS" ? tr("stepProofComplete") : tr(`step_${nextStep(task)}` as I18nKey);
  // Brand edge: orange for open work, green once closed. Breach is still called out by the red SLA badge.
  const accent = done ? colors.success : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.taskCode} ${task.stop?.name ?? task.title}`}
      onPress={onPress}
      style={(s) => {
        const st = s as { pressed: boolean; hovered?: boolean; focused?: boolean };
        return [
          styles.card,
          elevation[1],
          st.hovered && [styles.hover, elevation[2]],
          st.pressed && { transform: [{ scale: 0.985 }], opacity: 0.96 },
          st.focused && styles.focus,
        ];
      }}
    >
      {rich ? <RichBody task={task} serverTime={serverTime} distanceKm={distanceKm} pending={pending} done={done} nextLabel={nextLabel} /> : (
      <>
      <View style={[styles.accent, { backgroundColor: accent }]} />
        <View style={styles.inner}>
          <View style={styles.top}>
            <IconCircle icon={kindIcon(task.kind)} tone={done ? "green" : "peach"} size={42} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={styles.title} numberOfLines={2}>
                {task.stop?.name ?? task.title}
              </Text>
              <Text style={styles.code} numberOfLines={1}>
                {task.taskCode}
                {task.stop?.name && task.title !== task.stop.name ? ` · ${task.title}` : ""}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.faint} />
          </View>
          {task.stop?.address || task.area ? (
            <View style={styles.loc}>
              <MapPin size={14} color={colors.muted} />
              <Text style={[type.meta, { flex: 1 }]} numberOfLines={1}>
                {task.stop?.address ?? task.area}
              </Text>
              {distanceKm !== null ? <Text style={styles.dist}>{formatKm(distanceKm)}</Text> : null}
            </View>
          ) : null}
          <View style={styles.badges}>
            <KindBadge kind={task.kind} />
            <StateBadge state={task.state} />
            <SlaBadge sla={task.sla} serverTime={serverTime} completed={task.state === "COMPLETED"} />
            {task.attemptNo > 1 ? <Badge label={tr("attempt", { n: task.attemptNo })} tone="violet" /> : null}
            {pending ? <Badge label={tr("pendingSync")} tone="blue" dot /> : null}
          </View>
          {!done ? (
            <View style={styles.next}>
              <Text style={styles.nextLabel}>{tr("nextAction")}</Text>
              <View style={styles.nextPill}>
                <Text style={styles.nextValue} numberOfLines={1}>
                  {nextLabel}
                </Text>
                <ArrowRight size={16} color={colors.white} />
              </View>
            </View>
          ) : null}
        </View>
      </>
      )}
    </Pressable>
  );
}

const ART_H = 236;

function RichBody({ task, serverTime, distanceKm, pending, done, nextLabel }: { task: Task; serverTime: string | null; distanceKm: number | null; pending: boolean; done: boolean; nextLabel: string }) {
  const tr = useT();
  const art = jobArt(task.kind);
  const artW = art ? Math.round(ART_H * art.ratio) : 0;
  const Kind = kindIcon(task.kind);
  return (
    <View style={styles.richInner}>
      {art ? <JobArt kind={task.kind} height={ART_H} style={styles.art} /> : null}
      {art && distanceKm !== null ? (
        <View style={[styles.distPill, elevation[2]]}>
          <MapPin size={18} color={colors.ink} />
          <View>
            <Text style={styles.distValue}>{formatKm(distanceKm)}</Text>
            <Text style={styles.distLabel}>{tr("distanceLabel")}</Text>
          </View>
        </View>
      ) : null}
      <View style={[styles.richTop, { paddingRight: art ? artW - 36 : 0, minHeight: art ? ART_H - 40 : undefined }]}>
        <View style={styles.top}>
          <View style={styles.kindTile}>
            <Kind size={22} color={done ? colors.success : colors.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text style={styles.richTitle} numberOfLines={2}>
              {task.stop?.name ?? task.title}
            </Text>
            {task.stop?.name && task.title !== task.stop.name ? (
              <Text style={styles.richSub} numberOfLines={2}>
                {task.title}
              </Text>
            ) : null}
            <Text style={styles.code} numberOfLines={2}>
              {task.taskCode}
              {task.stop?.name && task.title !== task.stop.name ? ` · ${task.title}` : ""}
            </Text>
          </View>
        </View>
        {task.stop?.address || task.area ? (
          <View style={[styles.loc, { marginTop: space.lg, paddingLeft: 2 }]}>
            <MapPin size={18} color={colors.muted} />
            <Text style={styles.richLoc} numberOfLines={2}>
              {task.stop?.address ?? task.area}
            </Text>
            {!art && distanceKm !== null ? <Text style={styles.dist}>{formatKm(distanceKm)}</Text> : null}
          </View>
        ) : null}
      </View>
      <View style={[styles.badges, { marginTop: space.md }]}>
        <KindBadge kind={task.kind} />
        <StateBadge state={task.state} />
        <SlaBadge sla={task.sla} serverTime={serverTime} completed={task.state === "COMPLETED"} />
        {task.attemptNo > 1 ? <Badge label={tr("attempt", { n: task.attemptNo })} tone="violet" /> : null}
        {pending ? <Badge label={tr("pendingSync")} tone="blue" dot /> : null}
      </View>
      {!done ? (
        <View style={styles.richFoot}>
          <View style={styles.footTile}>
            <Kind size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.nextLabel}>{tr("nextAction")}</Text>
            <Text style={styles.footMain} numberOfLines={1}>
              {task.title}
            </Text>
            {task.area ?? task.customerName ? (
              <Text style={styles.footSub} numberOfLines={1}>
                {task.area ?? task.customerName}
              </Text>
            ) : null}
          </View>
          <ChevronRight size={20} color={colors.muted} />
          <View style={[styles.nextPill, styles.richPill]}>
            <Text style={[styles.nextValue, { fontSize: 17 }]} numberOfLines={1}>
              {nextLabel}
            </Text>
            <ArrowRight size={18} color={colors.white} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Loading placeholder with the same footprint as a JobCard. */
export function JobCardSkeleton() {
  return (
    <View style={[styles.card, elevation[1]]} accessibilityLabel="Loading">
      <View style={[styles.accent, { backgroundColor: colors.lineStrong }]} />
      <View style={styles.inner}>
        <View style={styles.top}>
          <Skeleton width={42} height={42} radius={14} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="70%" height={16} />
            <Skeleton width="50%" height={12} />
          </View>
        </View>
        <Skeleton width="85%" height={12} />
        <View style={styles.badges}>
          <Skeleton width={70} height={26} radius={999} />
          <Skeleton width={80} height={26} radius={999} />
          <Skeleton width={120} height={26} radius={999} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  accent: { width: 4 },
  inner: { flex: 1, padding: space.lg, gap: space.sm },
  top: { flexDirection: "row", alignItems: "center", gap: space.md },
  title: { fontSize: 17, fontWeight: "800", color: colors.ink, letterSpacing: -0.3 },
  hover: { borderColor: colors.peachBorder, transform: [{ translateY: -2 }] },
  focus: { outlineWidth: 2, outlineColor: colors.primary, outlineStyle: "solid", outlineOffset: 2 } as object,
  code: { ...type.caption, fontVariant: ["tabular-nums"] },
  loc: { flexDirection: "row", alignItems: "center", gap: 6 },
  dist: { fontSize: 14, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  next: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.md, marginTop: 2 },
  nextPill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: space.lg, minHeight: 44, flexShrink: 1, shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  nextLabel: { ...type.caption },
  richInner: { flex: 1, padding: space.xl, paddingBottom: space.lg, gap: space.sm },
  art: { position: "absolute", top: 0, right: 0 },
  distPill: { position: "absolute", top: 160, right: 14, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.white, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10 },
  distValue: { fontSize: 17, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"] },
  distLabel: { fontSize: 13, fontWeight: "500", color: colors.muted },
  richTop: { gap: 2 },
  kindTile: { width: 50, height: 50, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  richTitle: { fontSize: 22, fontWeight: "800", color: colors.ink, letterSpacing: -0.5, lineHeight: 28 },
  richSub: { fontSize: 16, fontWeight: "600", color: colors.primaryDark },
  richLoc: { flex: 1, fontSize: 15, fontWeight: "500", color: colors.muted },
  richFoot: { flexDirection: "row", alignItems: "center", gap: space.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.lg, marginTop: space.md },
  footTile: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  footMain: { fontSize: 17, fontWeight: "700", color: colors.ink },
  footSub: { fontSize: 14, fontWeight: "500", color: colors.muted },
  richPill: { minHeight: 56, paddingHorizontal: space.xl, flexShrink: 0 },
  nextValue: { fontSize: 15, fontWeight: "800", color: colors.white, flexShrink: 1 },
});
