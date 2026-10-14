import { useEffect, useState } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useT } from "@/components/status";
import { colors } from "@/constants/theme";

export type DialogButton = { text: string; style?: "default" | "cancel" | "destructive"; onPress?: () => void };
type Dialog = { id: number; title: string; message?: string; buttons: DialogButton[] };

let nextId = 1;
let enqueue: ((d: Dialog) => void) | null = null;
let okLabel = "OK"; // replaced by the translated label once <DialogHost /> mounts

/**
 * Show a message or a choice. Native uses the platform alert; react-native-web's Alert.alert is a
 * no-op, so on web the in-app <DialogHost /> renders it instead (never window.alert, which blocks the page).
 */
export function showDialog(title: string, message?: string, buttons?: DialogButton[]) {
  const list = buttons?.length ? buttons : [{ text: okLabel }];
  if (Platform.OS !== "web") {
    Alert.alert(title, message, list);
    return;
  }
  enqueue?.({ id: nextId++, title, message, buttons: list });
}

/** Ask before an action with consequences (sign out, clock out, SOS). */
export function confirmDialog(opts: {
  title: string;
  message?: string;
  confirm: string;
  cancel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  showDialog(opts.title, opts.message, [
    { text: opts.cancel, style: "cancel" },
    { text: opts.confirm, style: opts.destructive ? "destructive" : "default", onPress: opts.onConfirm },
  ]);
}

export function DialogHost() {
  const [queue, setQueue] = useState<Dialog[]>([]);
  const tr = useT();
  const { width } = useWindowDimensions();
  okLabel = tr("close");
  useEffect(() => {
    enqueue = (d) => setQueue((q) => [...q, d]);
    return () => {
      enqueue = null;
    };
  }, []);
  const current = queue[0];
  if (Platform.OS !== "web" || !current) return null;

  const close = (button?: DialogButton) => {
    setQueue((q) => q.slice(1));
    button?.onPress?.();
  };

  // Phones get a bottom sheet (thumb-reachable, full-width actions); wider screens a centred card.
  const sheet = width < 768;
  const ordered = sheet ? [...current.buttons].reverse() : current.buttons;
  return (
    <Modal transparent animationType={sheet ? "slide" : "fade"} visible onRequestClose={() => close(current.buttons.find((b) => b.style === "cancel"))}>
      <View style={[styles.backdrop, sheet && styles.backdropSheet]}>
        <View style={[styles.card, sheet && styles.sheet]} accessibilityRole="alert" aria-modal testID="app-dialog">
          {sheet ? <View style={styles.grabber} /> : null}
          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
          <View style={[styles.actions, sheet && styles.actionsSheet]}>
            {ordered.map((b) => (
              <Pressable
                key={b.text}
                accessibilityRole="button"
                onPress={() => close(b)}
                style={(st) => [styles.btn, sheet && styles.btnSheet, b.style === "cancel" ? styles.cancel : b.style === "destructive" ? styles.destructive : styles.primary, st.pressed && { opacity: 0.85 }]}
              >
                <Text style={[styles.btnText, b.style === "cancel" && { color: colors.ink }]}>{b.text}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,33,61,0.30)", alignItems: "center", justifyContent: "center", padding: 16 },
  backdropSheet: { justifyContent: "flex-end", padding: 0 },
  card: { backgroundColor: colors.white, borderRadius: 22, padding: 20, gap: 10, width: "100%", maxWidth: 520 },
  sheet: { maxWidth: undefined, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 28 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, marginBottom: 6 },
  title: { fontSize: 18, fontWeight: "800", color: colors.ink, letterSpacing: -0.2 },
  message: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  actionsSheet: { flexDirection: "column", flexWrap: "nowrap", alignItems: "stretch" },
  btn: { minHeight: 44, minWidth: 96, paddingHorizontal: 18, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnSheet: { minHeight: 50, alignSelf: "stretch" },
  primary: { backgroundColor: colors.primary },
  destructive: { backgroundColor: colors.danger },
  cancel: { backgroundColor: "#F4ECE3" },
  btnText: { color: colors.white, fontWeight: "800", fontSize: 15 },
});
