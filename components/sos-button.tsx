import { useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { confirmDialog, showDialog } from "@/components/dialog";
import { useT } from "@/components/status";
import { colors } from "@/constants/theme";
import { useApp, type SosOutcome } from "@/lib/app-context";

/**
 * SOS: asks first (no accidental triggers), records the event with GPS on the server (or queues it offline),
 * then states exactly what was delivered and offers to call the nearest manager. It never claims a push or
 * call happened when it did not.
 */
export function SosButton({ compact }: { compact?: boolean }) {
  const { sos } = useApp();
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  function describe(o: SosOutcome) {
    const lines: string[] = [];
    if (o.recorded === "SERVER") {
      lines.push(o.gpsRecorded ? tr("sosRecorded") : tr("sosRecordedNoGps"));
      const d = o.delivery;
      if (d) {
        lines.push(d.inAppNotified ? tr("sosInApp", { n: d.inAppNotified }) : tr("sosNoRecipients"));
        lines.push(d.push === "SENT" ? tr("sosPushSent") : d.push === "PARTIAL" ? tr("sosPushPartial") : tr("sosPushNotConfigured"));
      }
    } else {
      lines.push(tr("sosQueued"));
    }
    return lines.join("\n");
  }

  async function send() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const outcome = await sos();
      const manager = outcome.manager;
      const note = describe(outcome);
      if (!manager?.phone) {
        showDialog(tr("sosTitle"), `${note}\n\n${tr("sosNoManager")}`, [
          { text: tr("close"), style: "cancel" },
          { text: "112", style: "destructive", onPress: () => void Linking.openURL("tel:112").catch(() => undefined) },
        ]);
        return;
      }
      showDialog(tr("sosTitle"), `${note}\n\n${tr("sosBody", { name: manager.name, city: manager.city ?? "" })}\n${manager.phone}`, [
        { text: tr("close"), style: "cancel" },
        {
          text: tr("sosCall"),
          style: "destructive",
          onPress: () => void Linking.openURL(`tel:${manager.phone!.replace(/\s/g, "")}`).catch(() => showDialog(tr("sosTitle"), tr("sosCallUnavailable"))),
        },
      ]);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr("sos")}
      accessibilityHint={tr("sosConfirm")}
      disabled={busy}
      onPress={() =>
        confirmDialog({
          title: tr("sosTitle"),
          message: tr("sosConfirm"),
          confirm: tr("sosSend"),
          cancel: tr("cancel"),
          destructive: true,
          onConfirm: () => void send(),
        })
      }
      style={[styles.btn, compact && styles.compact, busy && { opacity: 0.6 }]}
    >
      <Text style={styles.txt}>{busy ? tr("saving") : tr("sos")}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: colors.danger, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center", minWidth: 64, minHeight: 44, justifyContent: "center" },
  compact: { paddingVertical: 8, paddingHorizontal: 14 },
  txt: { color: colors.white, fontWeight: "900", fontSize: 15, letterSpacing: 1 },
});
