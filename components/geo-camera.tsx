import { useState } from "react";
import { Alert, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Button, Muted } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import type { GeoPhoto } from "@/lib/types";

export function GeoCamera({ taskId, checkpoint }: { taskId: string; checkpoint: string }) {
  const { live, addPhoto } = useApp();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function capture() {
    if (!live) {
      Alert.alert("Location needed", "Wait for GPS or simulate a Hyderabad pin first.");
      return;
    }
    setBusy(true);
    try {
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
      const when = new Date().toISOString();
      const photo: GeoPhoto = {
        id: `ph-${Date.now()}`,
        taskId,
        checkpoint,
        uri: result.assets[0].uri,
        note: note.trim() || undefined,
        geo: {
          lat: live.lat,
          lng: live.lng,
          accuracyM: live.accuracyM,
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
      <Button label={busy ? "Saving…" : "Capture geotagged photo"} onPress={() => void capture()} disabled={busy} />
      <Muted>GPS, accuracy, timestamp and checkpoint are stored with the photo.</Muted>
    </View>
  );
}
