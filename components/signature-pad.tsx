import { useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { colors } from "@/constants/theme";
import type { Pt } from "@/lib/signature-png";

function toPath(strokes: Pt[][]) {
  return strokes
    .map((stroke) => {
      if (!stroke.length) return "";
      const [first, ...rest] = stroke;
      return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${rest.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}`;
    })
    .join(" ");
}

/** Finger/pointer signature. Reports raw strokes and the pad size so they can be rasterised to PNG. */
export function SignaturePad({
  onChange,
  hint,
  clearLabel,
}: {
  onChange: (strokes: Pt[][], size: { w: number; h: number }) => void;
  hint: string;
  clearLabel: string;
}) {
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const size = useRef({ w: 320, h: 160 });
  const current = useRef<Pt[]>([]);
  const all = useRef<Pt[][]>([]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          current.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
          all.current = [...all.current, current.current];
          setStrokes(all.current);
        },
        onPanResponderMove: (e) => {
          current.current = [...current.current, { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
          all.current = [...all.current.slice(0, -1), current.current];
          setStrokes(all.current);
        },
        onPanResponderRelease: () => onChange(all.current, size.current),
      }),
    [onChange],
  );

  const d = toPath(strokes);
  return (
    <View>
      <View
        accessibilityLabel={hint}
        style={styles.wrap}
        onLayout={(e: LayoutChangeEvent) => {
          size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        }}
        {...responder.panHandlers}
      >
        <Svg width="100%" height="160">
          <Rect x={0} y={0} width="100%" height="160" fill="#fff" />
          {d ? <Path d={d} stroke={colors.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        </Svg>
        {!d ? (
          <Text pointerEvents="none" style={styles.hint}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          all.current = [];
          setStrokes([]);
          onChange([], size.current);
        }}
        style={styles.clear}
      >
        <Text style={styles.clearTxt}>{clearLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 160, borderWidth: 1, borderColor: colors.peachBorder, borderRadius: 10, overflow: "hidden", backgroundColor: "#fff" },
  hint: { position: "absolute", top: 68, width: "100%", textAlign: "center", color: colors.muted, fontWeight: "600" },
  clear: { alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 4 },
  clearTxt: { color: colors.primaryDark, fontWeight: "700", fontSize: 13 },
});
