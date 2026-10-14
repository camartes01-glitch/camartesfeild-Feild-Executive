/**
 * Local holding area for evidence captured offline (photos, selfies, signatures).
 * Native: photos are copied into the app's document directory so they survive an app kill
 * and never bloat AsyncStorage. Web: expo-file-system is unavailable, so a data URI is kept.
 */
import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

let fs: typeof import("expo-file-system") | null = null;
if (Platform.OS !== "web") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  fs = require("expo-file-system");
}

const DIR = "field-evidence";

export type CapturedImage = { ref: string; contentType: string; previewUri: string };

function evidenceDir() {
  const dir = new fs!.Directory(fs!.Paths.document, DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/**
 * Opens the camera (never the gallery on phones: evidence must be taken on site).
 * Photos are compressed to keep uploads small on field networks.
 */
export async function captureImage(opts: { selfie?: boolean } = {}): Promise<CapturedImage | { error: string } | null> {
  if (Platform.OS === "web") {
    // Browsers expose the camera through the file picker (`capture` on mobile browsers).
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.5, base64: true });
    if (result.canceled || !result.assets?.[0]?.base64) return null;
    const asset = result.assets[0];
    const type = asset.mimeType ?? "image/jpeg";
    const ref = `data:${type};base64,${asset.base64}`;
    return { ref, contentType: type, previewUri: ref };
  }
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { error: "CAMERA_PERMISSION" };
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.5,
    allowsEditing: false,
    cameraType: opts.selfie ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const source = new fs!.File(asset.uri);
  const target = new fs!.File(evidenceDir(), `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  source.copy(target);
  return { ref: target.uri, contentType: asset.mimeType ?? "image/jpeg", previewUri: target.uri };
}

export async function readBase64(ref: string): Promise<string> {
  if (ref.startsWith("data:")) return ref.slice(ref.indexOf(",") + 1);
  return new fs!.File(ref).base64();
}

/** Delete local evidence once the server has confirmed the upload. */
export function releaseMedia(ref: string) {
  if (ref.startsWith("data:") || !fs) return;
  try {
    const file = new fs.File(ref);
    if (file.exists) file.delete();
  } catch {
    /* already gone */
  }
}
