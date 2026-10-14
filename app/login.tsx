import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from "react-native";
import { Redirect } from "expo-router";
import {
  ChartColumn,
  ChevronRight,
  CircleCheck,
  Eye,
  EyeOff,
  LockKeyhole,
  LogIn,
  Mail,
  MapPin,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react-native";
import { useT } from "@/components/status";
import { colors } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import { errorText, LANGS, type I18nKey, type Lang } from "@/lib/i18n";
import { apiConfigError } from "@/lib/ops-api";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^(?:\+?91|0)?[6-9]\d{9}$/;

// Official Camartes logo (copied unchanged from the Camartes brand assets).
const LOGO = require("../assets/images/camartes-logo.png");
const LOGO_RATIO = 1446 / 617;

/** Login-screen palette (brand values from the login design reference). */
const L = {
  navy: "#14213D",
  slate: "#52627A",
  muted: "#64748B",
  orange: colors.primary,
  orangePressed: "#E95725",
  cream: "#FFF8EF",
  canvas: "#FFFCF8",
  softOrange: "#FFE8D5",
  border: "#F1D6C0",
  pill: "#F3E9DF",
  errorBg: "#FDE9E9",
  errorText: "#C62828",
  errorIcon: "#E53935",
  success: colors.success,
};

const shadow = (web: string, native: object) => Platform.select({ web: { boxShadow: web } as object, default: native });

export default function LoginScreen() {
  const { user, ready, login, authMessage, language, setLanguage } = useApp();
  const tr = useT();
  const { width, height } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Redirect href={user.role === "operations_manager" ? "/admin" : "/"} />;

  const id = email.trim();
  const idValid = EMAIL.test(id) || PHONE.test(id.replace(/[\s-]/g, ""));

  async function submit() {
    if (busy || !password) return;
    if (!idValid) {
      setError(tr("loginInvalidEmail"));
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await login(id, password);
    setBusy(false);
    if (failure) setError(errorText(language, failure.code, failure.message));
  }

  const message = apiConfigError() || error || authMessage;
  const desktop = width >= 1024;
  const phone = width < 768;

  const card = (
    <View style={[styles.card, phone ? styles.cardPhone : styles.cardWide, shadow("0 24px 70px rgba(20,33,61,0.10)", styles.cardShadowNative)]}>
      <Text style={[styles.welcome, phone && { fontSize: 20 }]}>{tr("loginWelcome")}</Text>
      <Text style={[styles.title, phone && styles.titlePhone]} accessibilityRole="header">
        Camartes <Text style={{ color: L.orange }}>Field</Text>
      </Text>
      <Text style={[styles.subtitle, phone && { fontSize: 16 }]}>{tr("loginSubtitle")}</Text>

      <View style={{ marginTop: phone ? 28 : 40, gap: 20 }}>
        <LoginField
          label={tr("workEmail")}
          icon={Mail}
          phone={phone}
          nativeID="login-email"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          value={email}
          error={id && !idValid ? tr("loginInvalidEmail") : null}
          right={idValid ? <CircleCheck size={22} color={L.success} accessibilityLabel={tr("loginEmailLooksRight")} /> : null}
          onChangeText={(v) => {
            setEmail(v);
            setError(null);
          }}
        />
        <LoginField
          label={tr("password")}
          icon={LockKeyhole}
          phone={phone}
          nativeID="login-password"
          autoComplete="current-password"
          textContentType="password"
          secureTextEntry={!show}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setError(null);
          }}
          onSubmitEditing={() => void submit()}
          returnKeyType="done"
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={show ? tr("hidePassword") : tr("showPassword")}
              onPress={() => setShow((v) => !v)}
              style={styles.eye}
              hitSlop={6}
            >
              {show ? <EyeOff size={22} color={L.slate} /> : <Eye size={22} color={L.slate} />}
            </Pressable>
          }
        />
      </View>

      {message ? <ErrorBanner message={message} /> : null}

      <LoginButton
        label={busy ? tr("signingIn") : tr("signIn")}
        busy={busy}
        disabled={busy || !id || !password}
        phone={phone}
        onPress={() => void submit()}
      />

      <View style={styles.foot}>
        <ShieldCheck size={16} color={L.muted} />
        <Text style={styles.footText}>{tr("employment")}</Text>
      </View>
    </View>
  );

  const language_ = <LanguageSelector value={language} onChange={setLanguage} compact={phone} />;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: desktop ? L.canvas : L.cream }}>
      {desktop ? (
        <View style={styles.split}>
          <BrandPanel tr={tr} large={width >= 1440 && height >= 860} compact={width < 1280 || height < 860} short={height < 720} />
          <ScrollView style={{ flex: 56 }} contentContainerStyle={styles.right} keyboardShouldPersistTaps="handled">
            <View style={styles.rightInner}>
              <View style={styles.langRow}>{language_}</View>
              <View style={styles.centre}>{card}</View>
            </View>
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.single, phone && { paddingHorizontal: 16 }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.singleInner, { maxWidth: phone ? 520 : 680 }]}>
            <View style={styles.compactHeader}>
              <Image source={LOGO} style={{ width: phone ? 168 : 210, height: (phone ? 168 : 210) / LOGO_RATIO }} resizeMode="contain" accessibilityLabel="Camartes" />
              {phone ? null : language_}
            </View>
            {phone ? language_ : null}
            <View style={{ gap: phone ? 10 : 6 }}>
              <Text style={[styles.compactHeadline, phone && { fontSize: width < 360 ? 28 : 32, lineHeight: width < 360 ? 31 : 35 }]} accessibilityRole="header">
                <Headline tr={tr} />
              </Text>
              <Text style={[styles.tagline, { marginTop: 0, fontSize: phone ? 14 : 17, lineHeight: phone ? 20 : 25 }]}>{tr("loginTagline")}</Text>
              {phone || height < 600 ? <FeatureStrip tr={tr} /> : <FeatureRows tr={tr} tight />}
            </View>
            {card}
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

/* ───────────────────────── Brand panel (desktop) ───────────────────────── */

const FEATURES: { icon: LucideIcon; title: I18nKey; body: I18nKey }[] = [
  { icon: MapPin, title: "loginFeatVisits", body: "loginFeatVisitsBody" },
  { icon: UsersRound, title: "loginFeatPartners", body: "loginFeatPartnersBody" },
  { icon: ChartColumn, title: "loginFeatTogether", body: "loginFeatTogetherBody" },
];

/** The three value rows. `tight` shrinks them for short windows; they are never hidden. */
function FeatureRows({ tr, tight }: { tr: (k: I18nKey) => string; tight?: boolean }) {
  return (
    <View style={{ gap: tight ? 10 : 16, marginTop: tight ? 18 : 32 }}>
      {FEATURES.map(({ icon: Icon, title, body }) => (
        <View key={title} style={[styles.feature, tight && { gap: 14 }]}>
          <View style={[styles.featureIcon, tight && { width: 46, height: 46, borderRadius: 15 }]}>
            <Icon size={tight ? 22 : 26} color={L.orange} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, tight && { fontSize: 15 }]}>{tr(title)}</Text>
            <Text style={[styles.featureBody, tight && { fontSize: 13 }]}>{tr(body)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Phones: a compact wrap of feature chips instead of the tall desktop rows. */
function FeatureStrip({ tr }: { tr: (k: I18nKey) => string }) {
  return (
    <View style={styles.strip}>
      {FEATURES.map(({ icon: Icon, title }) => (
        <View key={title} style={styles.chip}>
          <Icon size={16} color={L.orange} />
          <Text style={styles.chipText} numberOfLines={1}>
            {tr(title)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function BrandPanel({ tr, large, compact, short }: { tr: (k: I18nKey) => string; large: boolean; compact: boolean; short: boolean }) {
  return (
    <View style={styles.brand}>
      <Landscape sun={!compact} />
      {/* Content sits above the decoration and flows to the bottom line; it scrolls rather than overlaps. */}
      <ScrollView style={{ zIndex: 10 }} contentContainerStyle={styles.brandScroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.brandInner, large && { paddingHorizontal: 72 }, compact && { paddingHorizontal: 44, paddingTop: 40 }, short && { paddingTop: 28 }]}>
          <Image
            source={LOGO}
            style={{ width: short ? 190 : compact ? 200 : 230, height: (short ? 190 : compact ? 200 : 230) / LOGO_RATIO }}
            resizeMode="contain"
            accessibilityLabel="Camartes"
          />
          <Text
            style={[styles.headline, large && { fontSize: 64, lineHeight: 66 }, compact && styles.headlineCompact, short && { fontSize: 38, lineHeight: 40, marginTop: 22 }]}
            accessibilityRole="header"
          >
            <Headline tr={tr} />
          </Text>
          <Text style={[styles.tagline, compact && { fontSize: 18, lineHeight: 26, marginTop: 12 }, short && { fontSize: 16, lineHeight: 23, marginTop: 10 }]}>
            {tr("loginTagline")}
          </Text>
          <FeatureRows tr={tr} tight={compact || short} />
        </View>
        <View style={[styles.brandLine, compact && { paddingLeft: 44 }, large && { paddingLeft: 72 }]}>
          <Text style={styles.brandLineText}>{tr("loginBrandLine")}</Text>
          <View style={styles.brandLineAccent} />
        </View>
      </ScrollView>
    </View>
  );
}

/** Abstract warm landscape: sun and layered hills drawn with plain views (no image, no extra dependency). */
function Landscape({ sun }: { sun: boolean }) {
  return (
    <View style={styles.landscape} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.glow, { width: 520, height: 520, borderRadius: 260, right: -200, top: -200, backgroundColor: "#FFD6B8", opacity: 0.35 }]} />
      {sun ? <View style={[styles.glow, { width: 74, height: 74, borderRadius: 37, left: "64%", bottom: 168, backgroundColor: "#FFC48A" }]} /> : null}
      <View style={[styles.hill, { width: "150%", height: 380, left: "-30%", bottom: -190, backgroundColor: "#FDBA74", opacity: 0.55 }]} />
      <View style={[styles.hill, { width: "120%", height: 330, left: "-45%", bottom: -175, backgroundColor: "#FB923C", opacity: 0.7 }]} />
      <View style={[styles.hill, { width: "110%", height: 300, left: "20%", bottom: -168, backgroundColor: "#F97316", opacity: 0.75 }]} />
      <View style={[styles.hill, { width: "160%", height: 230, left: "-30%", bottom: -130, backgroundColor: "#9A3412" }]} />
    </View>
  );
}

/* ───────────────────────── Small pieces ───────────────────────── */

/** Headline with the accent word in orange; some languages have no words before the accent. */
function Headline({ tr }: { tr: (k: I18nKey) => string }) {
  const before = tr("loginHeadlineA").trim();
  return (
    <>
      {before ? `${before} ` : ""}
      <Text style={{ color: L.orange }}>{tr("loginHeadlineAccent")}</Text> {tr("loginHeadlineB")}
    </>
  );
}

function LanguageSelector({ value, onChange, compact }: { value: Lang; onChange: (l: Lang) => void; compact?: boolean }) {
  return (
    <View style={[styles.lang, compact && { alignSelf: "stretch" }]} accessibilityRole="tablist">
      {LANGS.map((l) => {
        const on = l.id === value;
        return (
          <Pressable
            key={l.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            accessibilityLabel={l.label}
            onPress={() => onChange(l.id)}
            style={(s) => {
              const st = s as { pressed: boolean; focused?: boolean };
              return [
                styles.langItem,
                compact && { flex: 1, paddingHorizontal: 8 },
                on && [styles.langOn, shadow("0 2px 8px rgba(20,33,61,0.08)", styles.langOnNative)],
                st.pressed && !on && { opacity: 0.7 },
                st.focused && styles.focusRing,
              ];
            }}
          >
            <Text style={[styles.langText, on && styles.langTextOn]}>{l.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LoginField({
  label,
  icon: Icon,
  right,
  error,
  phone,
  ...props
}: TextInputProps & { label: string; icon: LucideIcon; right?: ReactNode; error?: string | null; phone?: boolean }) {
  const [focused, setFocused] = useState(false);
  const labelId = `${props.nativeID}-label`;
  return (
    <View style={{ gap: 8 }}>
      <Text nativeID={labelId} style={styles.label}>
        {label}
      </Text>
      <View
        style={[
          styles.input,
          phone && { minHeight: 58 },
          focused && [styles.inputFocus, shadow("0 0 0 4px rgba(255,107,53,0.10)", {})],
          !!error && { borderColor: L.errorIcon },
        ]}
      >
        <Icon size={22} color={focused ? L.orange : L.slate} />
        <TextInput
          accessibilityLabel={label}
          accessibilityLabelledBy={labelId}
          placeholderTextColor="#94A3B8"
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={styles.inputText}
        />
        {right}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

/** Existing error/offline message, unchanged; only presented as a bold first sentence plus the rest. */
function ErrorBanner({ message }: { message: string }) {
  const m = message.match(/^(.+?[.।!?])\s+(.+)$/s);
  const head = m ? m[1] : message;
  const rest = m ? m[2] : null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.err}>
      <View style={styles.errIcon}>
        <Text style={styles.errIconText}>!</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.errHead}>{head}</Text>
        {rest ? <Text style={styles.errBody}>{rest}</Text> : null}
      </View>
    </View>
  );
}

function LoginButton({ label, busy, disabled, phone, onPress }: { label: string; busy: boolean; disabled: boolean; phone: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={(s) => {
        const st = s as { pressed: boolean; focused?: boolean };
        return [
          styles.btn,
          phone && { height: 60 },
          !disabled && shadow("0 10px 24px rgba(255,107,53,0.25)", styles.btnShadowNative),
          st.pressed && !disabled && { backgroundColor: L.orangePressed, transform: [{ scale: 0.98 }] },
          disabled && { opacity: busy ? 0.85 : 0.5 },
          st.focused && styles.focusRing,
        ];
      }}
    >
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <LogIn size={22} color="#FFFFFF" />}
      <Text style={[styles.btnText, phone && { fontSize: 18 }]}>{label}</Text>
      <View style={styles.btnArrow}>
        <ChevronRight size={20} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: "row" },
  brand: { flex: 44, backgroundColor: L.cream, overflow: "hidden", position: "relative" },
  brandInner: { paddingHorizontal: 56, paddingTop: 56, maxWidth: 640, zIndex: 1 },
  headline: { fontSize: 58, lineHeight: 60, fontWeight: "800", letterSpacing: -2, color: L.navy, marginTop: 56 },
  headlineCompact: { fontSize: 44, lineHeight: 47, letterSpacing: -1.5, marginTop: 34 },
  tagline: { fontSize: 21, lineHeight: 30, color: L.slate, marginTop: 18, maxWidth: 470 },
  feature: { flexDirection: "row", alignItems: "center", gap: 18 },
  featureIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: "#FFE5D0", alignItems: "center", justifyContent: "center" },
  featureTitle: { fontSize: 18, fontWeight: "800", color: L.navy },
  featureBody: { fontSize: 15, color: L.muted, marginTop: 2 },
  landscape: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  glow: { position: "absolute" },
  hill: { position: "absolute", borderTopLeftRadius: 9999, borderTopRightRadius: 9999 },
  brandScroll: { flexGrow: 1, justifyContent: "space-between" },
  brandLine: { paddingLeft: 56, paddingTop: 72, paddingBottom: 34, gap: 10 },
  strip: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: L.border, borderRadius: 999, paddingHorizontal: 12, minHeight: 36 },
  chipText: { fontSize: 13, fontWeight: "700", color: L.navy },
  brandLineText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  brandLineAccent: { width: 64, height: 3, borderRadius: 2, backgroundColor: L.orange },

  right: { flexGrow: 1, paddingHorizontal: 48, paddingVertical: 36 },
  rightInner: { flex: 1, width: "100%", maxWidth: 820, alignSelf: "center" },
  langRow: { alignItems: "flex-end" },
  centre: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 28 },

  single: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 24, justifyContent: "center" },
  singleInner: { width: "100%", alignSelf: "center", gap: 20 },
  compactHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" },
  compactHeadline: { fontSize: 36, lineHeight: 40, fontWeight: "800", letterSpacing: -1.2, color: L.navy },

  card: { width: "100%", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(241,214,192,0.55)" },
  cardWide: { maxWidth: 680, borderRadius: 30, paddingHorizontal: 56, paddingTop: 56, paddingBottom: 44 },
  cardPhone: { borderRadius: 26, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24 },
  cardShadowNative: { shadowColor: L.navy, shadowOpacity: 0.1, shadowRadius: 30, shadowOffset: { width: 0, height: 16 }, elevation: 6 },
  welcome: { fontSize: 26, fontWeight: "500", color: L.navy },
  title: { fontSize: 52, lineHeight: 58, fontWeight: "800", letterSpacing: -2, color: L.navy, marginTop: 2 },
  titlePhone: { fontSize: 36, lineHeight: 42, letterSpacing: -1.2 },
  subtitle: { fontSize: 18, lineHeight: 26, color: L.muted, marginTop: 8 },

  label: { fontSize: 16, fontWeight: "700", color: L.navy },
  input: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1.5,
    borderColor: L.border,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
  },
  inputFocus: { borderColor: L.orange },
  inputText: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    color: L.navy,
    paddingVertical: 14,
    ...Platform.select({ web: { outlineStyle: "none" } as object, default: {} }),
  },
  eye: { width: 44, height: 44, marginRight: -10, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  fieldError: { fontSize: 14, fontWeight: "600", color: L.errorText },

  err: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: L.errorBg, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, marginTop: 16 },
  errIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: L.errorIcon, alignItems: "center", justifyContent: "center" },
  errIconText: { color: "#FFFFFF", fontSize: 20, fontWeight: "900", lineHeight: 22 },
  errHead: { fontSize: 17, fontWeight: "800", color: L.errorText },
  errBody: { fontSize: 16, color: L.errorText },

  btn: {
    height: 66,
    marginTop: 20,
    borderRadius: 18,
    backgroundColor: L.orange,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 64,
  },
  btnShadowNative: { shadowColor: L.orange, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  btnText: { color: "#FFFFFF", fontSize: 19, fontWeight: "800" },
  btnArrow: { position: "absolute", right: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(154,52,18,0.35)", alignItems: "center", justifyContent: "center" },

  foot: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 22 },
  footText: { fontSize: 14, color: L.muted, fontWeight: "600" },

  lang: { flexDirection: "row", backgroundColor: L.pill, borderRadius: 24, padding: 5, gap: 4, minHeight: 56 },
  langItem: { minHeight: 46, paddingHorizontal: 22, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  langOn: { backgroundColor: "#FFFFFF" },
  langOnNative: { shadowColor: L.navy, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  langText: { fontSize: 16, fontWeight: "600", color: L.slate },
  langTextOn: { color: L.navy, fontWeight: "700" },
  focusRing: Platform.select({ web: { outlineWidth: 3, outlineColor: "rgba(255,107,53,0.45)", outlineStyle: "solid", outlineOffset: 2 } as object, default: {} }),
});
