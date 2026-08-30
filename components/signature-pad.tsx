import { useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { colors } from "@/constants/theme";

type Pt = { x: number; y: number };

function toPath(strokes: Pt[][]) {
  return strokes
    .map((stroke) => {
      if (!stroke.length) return "";
      const [first, ...rest] = stroke;
      return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${rest.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}`;
    })
    .join(" ");
}

export function SignaturePad({
  value,
  onChange,
}: {
  value?: string;
  onChange: (svg: string) => void;
}) {
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const current = useRef<Pt[]>([]);
  const d = value || toPath(strokes);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          current.current = [{ x: locationX, y: locationY }];
          setStrokes((s) => [...s, current.current]);
        },
        onPanResponderMove: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          current.current = [...current.current, { x: locationX, y: locationY }];
          setStrokes((s) => {
            const next = s.slice(0, -1);
            next.push(current.current);
            return next;
          });
        },
        onPanResponderRelease: () => {
          setStrokes((s) => {
            onChange(toPath(s));
            return s;
          });
        },
      }),
    [onChange],
  );

  return (
    <View>
      <View
        accessibilityLabel="Customer signature pad"
        accessibilityHint="Draw a signature with a finger or pointer"
        style={styles.wrap}
        {...responder.panHandlers}
      >
        <Svg width="100%" height="140">
          <Rect x={0} y={0} width="100%" height="140" fill="#fff" />
          {d ? (
            <Path
              d={d}
              stroke={colors.ink}
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </Svg>
        {!d ? (
          <Text pointerEvents="none" style={styles.hint}>
            Customer signs here
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setStrokes([]);
          onChange("");
        }}
        style={styles.clear}
      >
        <Text style={styles.clearTxt}>Clear signature</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 140,
    borderWidth: 1,
    borderColor: colors.peachBorder,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  hint: {
    position: "absolute",
    alignSelf: "center",
    top: 58,
    width: "100%",
    textAlign: "center",
    color: colors.muted,
    fontWeight: "600",
  },
  clear: { alignSelf: "flex-end", paddingVertical: 8 },
  clearTxt: { color: colors.primaryDark, fontWeight: "700", fontSize: 13 },
});
