import { useState } from "react";
import { Image, View } from "react-native";
import { showDialog } from "@/components/dialog";
import { Button } from "@/components/ui";
import { useT } from "@/components/status";
import { captureImage, type CapturedImage } from "@/lib/media-store";
import { SelfieCamera } from "@/components/selfie-camera";

/**
 * Captures evidence with the camera. Nothing is attached when the employee cancels:
 * the app never substitutes a placeholder image.
 */
export function GeoCamera({
  label,
  onCaptured,
  selfie,
  disabled,
}: {
  label: string;
  onCaptured: (image: CapturedImage) => void;
  selfie?: boolean;
  disabled?: boolean;
}) {
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);

  async function capture() {
    // Selfies go through the live camera with an explicit Retake / Use selfie review.
    if (selfie) {
      setSelfieOpen(true);
      return;
    }
    setBusy(true);
    try {
      const result = await captureImage({ selfie });
      if (!result) return;
      if ("error" in result) {
        showDialog(tr("err_CAMERA_PERMISSION"));
        return;
      }
      setPreview(result.previewUri);
      onCaptured(result);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      {preview ? <Image source={{ uri: preview }} style={{ height: 140, borderRadius: 10 }} resizeMode="cover" /> : null}
      <Button label={busy ? tr("saving") : label} variant="outline" disabled={busy || disabled} onPress={() => void capture()} />
      {selfie && selfieOpen ? (
        <SelfieCamera
          visible
          onClose={() => setSelfieOpen(false)}
          onConfirm={(img) => {
            setSelfieOpen(false);
            setPreview(img.previewUri);
            onCaptured(img);
          }}
        />
      ) : null}
    </View>
  );
}
