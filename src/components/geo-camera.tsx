"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/app-context";
import { formatCoord } from "@/lib/geo";
import type { GeoPhoto } from "@/lib/types";

function stampPhoto(
  dataUrl: string,
  meta: { lat: number; lng: number; accuracyM: number; when: string; checkpoint: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = img.width;
      const h = img.height;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const bar = Math.max(72, Math.round(h * 0.16));
      ctx.fillStyle = "rgba(8,12,20,0.72)";
      ctx.fillRect(0, h - bar, w, bar);
      ctx.fillStyle = "#FF6B35";
      ctx.font = `600 ${Math.max(14, Math.round(w * 0.028))}px ui-sans-serif, system-ui`;
      ctx.fillText("CAMARTES · geotagged proof", 16, h - bar + 22);
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.max(12, Math.round(w * 0.024))}px ui-monospace, monospace`;
      const lines = [
        meta.checkpoint,
        `${formatCoord(meta.lat, 6)}, ${formatCoord(meta.lng, 6)}  ±${Math.round(meta.accuracyM)}m`,
        meta.when,
      ];
      lines.forEach((line, i) => {
        ctx.fillText(line, 16, h - bar + 44 + i * 18);
      });
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("Could not read photo"));
    img.src = dataUrl;
  });
}

export function GeoCamera({
  taskId,
  checkpoint,
}: {
  taskId: string;
  checkpoint: string;
}) {
  const { live, addPhoto } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function onFile(file: File) {
    if (!live) {
      toast.error("Wait for a live location fix, or simulate a Hyderabad pin first.");
      return;
    }
    setBusy(true);
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Read failed"));
        reader.readAsDataURL(file);
      });
      const when = new Date().toISOString();
      const stamped = await stampPhoto(raw, {
        lat: live.lat,
        lng: live.lng,
        accuracyM: live.accuracyM,
        when: new Date(when).toLocaleString("en-IN"),
        checkpoint,
      });
      const photo: GeoPhoto = {
        id: `ph-${Date.now()}`,
        taskId,
        checkpoint,
        dataUrl: stamped,
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
      toast.success("Photo saved with GPS metadata.");
    } catch {
      toast.error("Could not attach the photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note (tower name, serial check, customer name…)"
        className="min-h-16"
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        className="w-full"
        size="lg"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Camera />}
        Capture geotagged photo
      </Button>
      <p className="text-muted-foreground text-xs">
        GPS, accuracy, timestamp and checkpoint are stamped on the image and stored as metadata.
      </p>
    </div>
  );
}
