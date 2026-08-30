import { useState } from "react";
import { Alert, Platform, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Button, Muted } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { LOCATION_PRESETS } from "@/lib/seed";
import type { GeoPhoto } from "@/lib/types";

const WEB_STILL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect fill="#FFEDD5" width="100%" height="100%"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#EA580C" font-size="22" font-family="sans-serif">Camartes geotag proof</text></svg>`,
  );

export function GeoCamera({ taskId, checkpoint }: { taskId: string; checkpoint: string }) {
  const { live, addPhoto, locationMode } = useApp();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const geo = (() => {
    if (live) return live;
    const preset = LOCATION_PRESETS.find((p) => p.id === locationMode);
    if (preset && preset.id !== "live") {
      return { lat: preset.lat, lng: preset.lng, accuracyM: 12 };
    }
    return null;
  })();

  async function capture() {
    if (!geo) {
      Alert.alert("Location needed", "Clock in or pick a Hyderabad hub pin first.");
      return;
    }
    setBusy(true);
    try {
      let uri: string | undefined;
      if (Platform.OS === "web") {
        const lib = await ImagePicker.launchImageLibraryAsync({ quality: 0.45 });
        uri = lib.canceled || !lib.assets?.[0] ? WEB_STILL : lib.assets[0].uri;
      } else {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Camera", "Camera permission is required for geotagged proofs.");
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          quality: 0.45,
          allowsEditing: false,
        });
        if (result.canceled || !result.assets[0]) return;
        uri = result.assets[0].uri;
      }
        if (!uri) return;
      const when = new Date().toISOString();
      const photo: GeoPhoto = {
        id: `ph-${Date.now()}`,
        taskId,
        checkpoint,
        uri,
        note: note.trim() || undefined,
        geo: {
          lat: geo.lat,
          lng: geo.lng,
          accuracyM: geo.accuracyM,
          capturedAt: when,
        },
      };
      addPhoto(taskId, photo);
      setNote("");
      Alert.alert("Saved", "Photo stored with GPS metadata.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <TextInput
        nativeID={`photo-note-${taskId}-${checkpoint.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
        accessibilityLabel={`Optional note for ${checkpoint} photo`}
        placeholder="Optional note (tower, serial, customer…)"
        value={note}
        onChangeText={setNote}
        multiline
        style={{
          minHeight: 56,
          borderWidth: 1,
          borderColor: "#FED7AA",
          borderRadius: 10,
          padding: 10,
          backgroundColor: "#fff",
        }}
      />
      <Button
        label={busy ? "Saving…" : Platform.OS === "web" ? "Attach geotagged proof" : "Capture geotagged photo"}
        onPress={() => void capture()}
        disabled={busy}
      />
      <Muted>
        {geo
          ? `Will tag ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`
          : "GPS, accuracy, timestamp and checkpoint are stored with the photo."}
      </Muted>
    </View>
  );
}
