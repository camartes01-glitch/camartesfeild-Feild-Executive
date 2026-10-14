import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraOff, RotateCcw, ShieldAlert, X } from "lucide-react-native";
import { Button } from "@/components/ui";
import { useT } from "@/components/status";
import { colors, radii, space } from "@/constants/theme";
import { captureImage, releaseMedia, type CapturedImage } from "@/lib/media-store";

type Phase =
  | { k: "requesting" }
  | { k: "live" }
  | { k: "captured"; image: CapturedImage }
  | { k: "denied" } // native: permission refused (can open OS settings)
  | { k: "blocked" } // web: browser permission refused
  | { k: "unavailable"; insecure?: boolean }
  | { k: "failed" }; // capture itself failed

const WEB = Platform.OS === "web";

/**
 * Selfie capture with an explicit confirmation step. The camera only starts after the employee taps "Take selfie"
 * (this component is mounted then), and `onConfirm` fires only on "Use selfie": opening the camera, pressing the
 * shutter or closing never satisfies the requirement.
 *
 * Web (laptop/desktop/mobile browsers): live webcam via getUserMedia, front-facing when the device offers it,
 * captured from a canvas as JPEG. Every media track is stopped on capture, close and unmount.
 * Android/iOS: the system front camera through the existing media-store (expo-image-picker), then the same
 * Retake / Use selfie review here. The resulting image goes through the existing clock-in upload/offline queue.
 */
export function SelfieCamera({ visible, onClose, onConfirm }: { visible: boolean; onClose: () => void; onConfirm: (image: CapturedImage) => void }) {
  const tr = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const full = !WEB || width < 768;
  const [phase, setPhase] = useState<Phase>({ k: "requesting" });
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const discard = useRef<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  /** Drop a captured-but-unconfirmed native file so retakes don't pile up on the device. */
  const dropPending = useCallback(() => {
    if (discard.current) releaseMedia(discard.current);
    discard.current = null;
  }, []);

  const startWeb = useCallback(async () => {
    setPhase({ k: "requesting" });
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) {
      setPhase({ k: "unavailable", insecure: typeof window !== "undefined" && !window.isSecureContext });
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await md.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } } });
      } catch (e) {
        // Some webcams reject the constraints; fall back to any camera.
        if ((e as DOMException)?.name !== "OverconstrainedError") throw e;
        stream = await md.getUserMedia({ audio: false, video: true });
      }
      streamRef.current = stream;
      setPhase({ k: "live" });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setPhase(name === "NotAllowedError" || name === "SecurityError" ? { k: "blocked" } : { k: "unavailable" });
    }
  }, []);

  const startNative = useCallback(async () => {
    setPhase({ k: "requesting" });
    try {
      const res = await captureImage({ selfie: true });
      if (!res) {
        onClose(); // employee backed out of the system camera
        return;
      }
      if ("error" in res) {
        setPhase({ k: "denied" });
        return;
      }
      discard.current = res.ref;
      setPhase({ k: "captured", image: res });
    } catch {
      setPhase({ k: "unavailable" });
    }
  }, [onClose]);

  const start = WEB ? startWeb : startNative;

  // Lifecycle: start when shown, always release the camera when hidden or unmounted.
  useEffect(() => {
    if (!visible) return;
    void start();
    return () => {
      stopStream();
    };
  }, [visible, start, stopStream]);

  // Attach the stream once the <video> exists.
  useEffect(() => {
    if (phase.k === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [phase.k]);

  function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) {
      setPhase({ k: "failed" });
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      // Draw un-mirrored: the stored selfie keeps true orientation; only the live preview is mirrored.
      canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
      const ref = canvas.toDataURL("image/jpeg", 0.85);
      stopStream();
      setPhase({ k: "captured", image: { ref, contentType: "image/jpeg", previewUri: ref } });
    } catch {
      setPhase({ k: "failed" });
    }
  }

  function retake() {
    dropPending();
    void start();
  }

  function close() {
    stopStream();
    dropPending();
    onClose();
  }

  function use() {
    if (phase.k !== "captured") return;
    discard.current = null; // now owned by the clock-in flow
    stopStream();
    onConfirm(phase.image);
  }

  const dark = full;
  const fg = dark ? colors.white : colors.ink;
  const sub = dark ? "rgba(255,255,255,0.72)" : colors.muted;

  const message = (icon: typeof CameraOff, title: string, body: string, actions: React.ReactNode) => {
    const Icon = icon;
    return (
      <View style={styles.state} accessibilityRole="alert">
        <View style={[styles.stateIcon, dark && { backgroundColor: "rgba(255,255,255,0.1)" }]}>
          <Icon size={28} color={colors.primary} />
        </View>
        <Text style={[styles.stateTitle, { color: fg }]}>{title}</Text>
        <Text style={[styles.stateBody, { color: sub }]}>{body}</Text>
        <View style={styles.actions}>{actions}</View>
      </View>
    );
  };

  let body: React.ReactNode;
  switch (phase.k) {
    case "requesting":
      body = (
        <View style={[styles.state, styles.frame(full)]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateBody, { color: sub }]}>{WEB ? tr("camRequesting") : tr("camOpening")}</Text>
        </View>
      );
      break;
    case "live":
      body = (
        <>
          <View style={styles.frame(full)}>
            {createElement("video", {
              ref: videoRef,
              autoPlay: true,
              playsInline: true,
              muted: true,
              "aria-label": tr("camTitle"),
              style: { width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: "block" },
            })}
          </View>
          <View style={styles.controls}>
            <Pressable accessibilityRole="button" accessibilityLabel={tr("camCapture")} onPress={shoot} style={(s) => [styles.shutter, s.pressed && { transform: [{ scale: 0.94 }] }]}>
              <View style={styles.shutterCore} />
            </Pressable>
          </View>
        </>
      );
      break;
    case "captured":
      body = (
        <>
          <View style={styles.frame(full)}>
            <Image source={{ uri: phase.image.previewUri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={tr("camTitle")} />
          </View>
          <View style={styles.actions}>
            <Button flex={1} variant="secondary" label={tr("camRetake")} icon={RotateCcw} onPress={retake} />
            <Button flex={1} label={tr("camUse")} onPress={use} />
          </View>
        </>
      );
      break;
    case "denied":
      body = message(
        ShieldAlert,
        tr("camDeniedTitle"),
        tr("camDeniedBody"),
        <>
          <Button flex={1} variant="secondary" label={tr("cancel")} onPress={close} />
          <Button flex={1} label={tr("camOpenSettings")} onPress={() => void Linking.openSettings()} />
        </>,
      );
      break;
    case "blocked":
      body = message(ShieldAlert, tr("camBlockedTitle"), tr("camBlockedBody"), <Button flex={1} label={tr("camTryAgain")} onPress={() => void start()} />);
      break;
    case "unavailable":
      body = message(
        CameraOff,
        tr("camUnavailableTitle"),
        phase.insecure ? tr("camInsecureBody") : tr("camUnavailableBody"),
        <Button flex={1} label={tr("camTryAgain")} onPress={() => void start()} />,
      );
      break;
    case "failed":
      body = message(CameraOff, tr("camUnavailableTitle"), tr("camCaptureFailed"), <Button flex={1} label={tr("camTryAgain")} onPress={() => void start()} />);
      break;
  }

  return (
    <Modal visible={visible} transparent={!full} animationType={full ? "slide" : "fade"} onRequestClose={close} statusBarTranslucent>
      <View style={full ? [styles.fullRoot, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }] : styles.overlay}>
        <View style={full ? styles.fullBody : styles.card} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: fg }]}>{tr("camTitle")}</Text>
              <Text style={[styles.hint, { color: sub }]}>{tr("camHint")}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={tr("camClose")} onPress={close} hitSlop={8} style={[styles.closeBtn, dark && { backgroundColor: "rgba(255,255,255,0.12)" }]}>
              <X size={20} color={fg} />
            </Pressable>
          </View>
          {body}
        </View>
      </View>
    </Modal>
  );
}

const frameBase = { width: "100%" as const, borderRadius: 20, overflow: "hidden" as const, backgroundColor: "#0B1220" };

const styles = {
  ...StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(20,33,61,0.55)", alignItems: "center", justifyContent: "center", padding: space.lg },
    card: {
      width: 520,
      maxWidth: "90%",
      backgroundColor: colors.white,
      borderRadius: 24,
      padding: space.xl,
      gap: space.lg,
      ...(Platform.OS === "web" ? ({ boxShadow: "0 20px 60px rgba(20,33,61,0.25)" } as object) : {}),
    },
    fullRoot: { flex: 1, backgroundColor: "#000000" },
    fullBody: { flex: 1, paddingHorizontal: space.lg, gap: space.lg, justifyContent: "space-between" },
    header: { flexDirection: "row", alignItems: "center", gap: space.md },
    title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
    hint: { fontSize: 13, fontWeight: "500", marginTop: 2 },
    closeBtn: { width: 44, height: 44, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted },
    controls: { alignItems: "center", paddingVertical: space.sm },
    shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: colors.primary, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
    shutterCore: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.white, borderWidth: 1, borderColor: "rgba(20,33,61,0.12)" },
    actions: { flexDirection: "row", gap: space.md, width: "100%" },
    state: { alignItems: "center", justifyContent: "center", gap: space.sm, paddingVertical: space.xl },
    stateIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
    stateTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
    stateBody: { fontSize: 14, fontWeight: "500", textAlign: "center", maxWidth: 360, marginBottom: space.md },
  }),
  /** 4:3 landscape in the modal; portrait 3:4 when the camera fills a phone screen. */
  frame: (full: boolean) => ({ ...frameBase, aspectRatio: full ? 3 / 4 : 4 / 3, maxHeight: full ? ("70%" as const) : undefined, alignSelf: "center" as const }),
};
