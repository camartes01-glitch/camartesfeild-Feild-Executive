import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Check, ChevronRight } from "lucide-react-native";
import { NavigateButton } from "@/components/navigate-button";
import { SlaBadge, StateBadge, useT } from "@/components/status";
import { colors, radii, space, type } from "@/constants/theme";
import type { I18nKey } from "@/lib/i18n";
import type { RosterStop } from "@/lib/types";

type Phase = "done" | "current" | "upcoming";

function phaseOf(stop: RosterStop, currentTaskId: string | null | undefined): Phase {
  if (stop.task?.state === "COMPLETED" || stop.task?.state === "CANCELLED") return "done";
  if (stop.task && stop.task.id === currentTaskId) return "current";
  return "upcoming";
}

/**
 * Today's route as a timeline: numbered nodes joined by a line; completed stops are ticked and quiet, the current
 * stop is highlighted, upcoming stops are outlined. Tapping a stop opens its job; Navigate is secondary.
 */
export function RouteTimeline({
  stops,
  currentTaskId,
  onOpen,
  detailed,
  limit,
}: {
  stops: RosterStop[];
  currentTaskId?: string | null;
  onOpen: (taskId: string) => void;
  detailed?: boolean;
  limit?: number;
}) {
  const shown = limit ? stops.slice(0, limit) : stops;
  return (
    <View>
      {shown.map((stop, i) => (
        <RouteStop
          key={stop.id}
          stop={stop}
          phase={phaseOf(stop, currentTaskId)}
          last={i === shown.length - 1}
          onOpen={onOpen}
          detailed={detailed}
        />
      ))}
    </View>
  );
}

export function RouteStop({
  stop,
  phase,
  last,
  onOpen,
  detailed,
}: {
  stop: RosterStop;
  phase: Phase;
  last: boolean;
  onOpen: (taskId: string) => void;
  detailed?: boolean;
}) {
  const tr = useT();
  const done = phase === "done";
  const current = phase === "current";
  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View style={[styles.node, done && styles.nodeDone, current && styles.nodeCurrent]}>
          {done ? <Check size={14} color={colors.white} /> : <Text style={[styles.nodeText, current && { color: colors.white }]}>{stop.sequence}</Text>}
        </View>
        {!last ? <View style={[styles.line, done && { backgroundColor: "#B9EBD5" }]} /> : null}
      </View>
      <View style={[styles.body, !last && { paddingBottom: space.lg }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${stop.sequence}. ${stop.name}`}
          disabled={!stop.task}
          onPress={() => stop.task && onOpen(stop.task.id)}
          style={(s) => [
            styles.card,
            detailed && styles.cardRich,
            current && styles.cardCurrent,
            done && styles.cardDone,
            (s as { hovered?: boolean }).hovered && !!stop.task && !current && styles.cardHover,
            s.pressed && { opacity: 0.85 },
          ]}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[styles.name, done && { color: colors.muted }]} numberOfLines={2}>
              {stop.name}
            </Text>
            <Text style={type.meta} numberOfLines={1}>
              {tr(`stop_${stop.type}` as I18nKey)}
              {stop.windowStart ? ` · ${stop.windowStart}–${stop.windowEnd ?? ""}` : ""}
            </Text>
            {detailed && stop.address ? (
              <Text style={type.meta} numberOfLines={2}>
                {stop.address}
              </Text>
            ) : null}
            {stop.task ? (
              <View style={styles.badges}>
                <StateBadge state={stop.task.state} />
                {detailed ? <SlaBadge sla={stop.task.sla} completed={done} /> : null}
              </View>
            ) : null}
          </View>
          {stop.task ? <ChevronRight size={18} color={colors.faint} /> : null}
        </Pressable>
        {detailed && !done ? (
          <View style={{ marginTop: space.sm, alignSelf: "flex-start" }}>
            <NavigateButton compact dest={stop} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.md },
  rail: { width: 28, alignItems: "center" },
  node: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  nodeDone: { backgroundColor: colors.success, borderColor: colors.success },
  nodeCurrent: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...Platform.select({ web: { boxShadow: "0 0 0 4px rgba(255,107,53,0.18)" }, default: {} }),
  },
  nodeText: { fontSize: 12, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"] },
  line: { flex: 1, width: 2, backgroundColor: colors.line, marginTop: -2, marginBottom: -2 },
  body: { flex: 1, minWidth: 0 },
  card: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 2 },
  cardRich: { backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, padding: space.md, marginTop: -6 },
  cardCurrent: { backgroundColor: colors.primarySoft, borderColor: colors.peachBorder, borderRadius: radii.md, padding: space.md, marginTop: -6 },
  cardDone: { opacity: 0.85 },
  cardHover: { backgroundColor: colors.surfaceMuted },
  name: { fontSize: 15, fontWeight: "700", color: colors.ink },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
});
