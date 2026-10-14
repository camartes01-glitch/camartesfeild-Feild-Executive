import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, Clock, CloudOff, Crosshair, History, MapPin, Search, X, type LucideIcon } from "lucide-react-native";
import { Badge, Button, IconButton, SegmentedControl } from "@/components/ui";
import { useT } from "@/components/status";
import { colors, elevation, radii, space, type } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import {
  GEO,
  cachedGet,
  childrenPath,
  nextStep,
  recentLocations,
  recentSearches,
  rememberLocation,
  rememberSearch,
  searchOffline,
  cachedValue,
  type BrowseStep,
  type GeoUnit,
  type MyArea,
  type PincodeOffice,
} from "@/lib/geography";
import { isStaleFix } from "@/lib/geo";
import { useLayout } from "@/lib/responsive";

type Tab = "villages" | "towns" | "localBodies";

/** Where a place sits, without repeating its own name: "Hyderabad → Telangana → India". */
const where = (u: GeoUnit) => u.hierarchy.split(" → ").slice(1).join(" → ");

/**
 * Location picker for the India administrative hierarchy. Search first (names, former names, local-language
 * spellings, 6-digit pincodes), then nearby and recent places, then browse State/UT → District → Sub-district →
 * Village/Town. Phones: bottom sheet. Tablets/laptops: two panes (browse | search). Lists are paged and
 * parent-filtered on the server; nothing national is downloaded.
 */
export function LocationPicker({
  visible,
  title,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (unit: GeoUnit) => void;
}) {
  const tr = useT();
  const l = useLayout();
  const insets = useSafeAreaInsets();
  const app = useApp();
  const owner = app.user?.id ?? "anon";
  const twoPane = l.width >= 768;
  // Laptops get a third pane with the selected place and the Confirm action.
  const threePane = l.isDesktop;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoUnit[] | null>(null);
  const [offices, setOffices] = useState<PincodeOffice[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOfflineMode, setSearchOfflineMode] = useState(false);
  const [recent, setRecent] = useState<GeoUnit[]>([]);
  const [recentQ, setRecentQ] = useState<string[]>([]);
  const [nearby, setNearby] = useState<{ items: GeoUnit[]; note?: string; weak?: boolean } | null>(null);
  const [nearbyBusy, setNearbyBusy] = useState(false);
  // Selection is two-step: pick, review the hierarchy, then Confirm.
  const [pending, setPending] = useState<GeoUnit | null>(null);
  const [assigned, setAssigned] = useState<GeoUnit | null>(null);

  const [trail, setTrail] = useState<BrowseStep[]>([{ level: "ROOT" }]);
  const [tab, setTab] = useState<Tab>("villages");
  const [rows, setRows] = useState<GeoUnit[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const step = trail[trail.length - 1];

  useEffect(() => {
    if (!visible) return;
    setPending(null);
    void recentLocations(owner).then(setRecent);
    void recentSearches(owner).then(setRecentQ);
    // The employee's own area (cached, so it is offered offline too).
    void cachedValue<MyArea>(owner, app.get, `${GEO}/me`, "me").then(({ value }) => setAssigned(value?.assigned ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, owner]);

  // Browse list for the current step (and tab), with "load more".
  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      setError(null);
      const path = childrenPath(step, offset, tab);
      const res = await cachedGet(owner, app.get, path);
      setLoading(false);
      setOffline(res.offline);
      if (!res.page) {
        setError(res.error ?? tr("loadFailed"));
        return;
      }
      setRows((prev) => (offset === 0 ? res.page!.items : [...prev, ...res.page!.items]));
      setNext(res.page.nextOffset);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, tab, owner, app.get],
  );

  useEffect(() => {
    if (visible) void load(0);
  }, [visible, load]);

  // Debounced server search; falls back to what the device has seen when offline.
  const seq = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setOffices([]);
      return;
    }
    const mine = ++seq.current;
    setSearching(true);
    const handle = setTimeout(async () => {
      const res = await app.get<{ items: GeoUnit[]; pincodes: PincodeOffice[] }>(`${GEO}/search?query=${encodeURIComponent(q)}&limit=20`);
      if (mine !== seq.current) return;
      if (res.ok) {
        setResults(res.body.items);
        setOffices(res.body.pincodes ?? []);
        setSearchOfflineMode(false);
        if (res.body.items.length || res.body.pincodes?.length) void rememberSearch(owner, q);
      } else {
        setResults(await searchOffline(owner, q));
        setOffices([]);
        setSearchOfflineMode(true);
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, owner]);

  async function findNearby() {
    const fix = app.live;
    if (!fix || isStaleFix(fix)) {
      setNearby({ items: [], note: app.gpsStatus === "denied" || app.gpsStatus === "services_off" ? tr("geoNearbyDenied") : tr("geoNearbyNoFix") });
      app.refreshGps();
      return;
    }
    setNearbyBusy(true);
    const { value, offline } = await cachedValue<{ items: GeoUnit[]; weakFix: boolean }>(
      owner,
      app.get,
      `${GEO}/nearby?lat=${fix.lat.toFixed(4)}&lng=${fix.lng.toFixed(4)}&accuracy_m=${Math.round(fix.accuracyM)}&limit=8`,
      "nearby",
    );
    setNearbyBusy(false);
    if (!value) return setNearby({ items: [], note: tr("geoOfflineSaved") });
    setNearby({
      items: value.items,
      weak: value.weakFix || fix.accuracyM > 100,
      note: offline ? tr("geoOfflineSaved") : value.items.length ? undefined : tr("geoNearbyNone"),
    });
  }

  function choose(unit: GeoUnit) {
    setPending(unit);
  }

  function confirm() {
    if (!pending) return;
    void rememberLocation(owner, pending);
    onSelect(pending);
    setPending(null);
    onClose();
  }

  function drill(unit: GeoUnit) {
    const s = nextStep(unit);
    if (!s) return choose(unit);
    setTab(s.level === "DISTRICT" ? "villages" : "villages");
    setTrail((t) => [...t, s]);
  }

  function goTo(i: number) {
    setTab("villages");
    setTrail((t) => t.slice(0, i + 1));
  }

  const tabs = useMemo(() => {
    if (step.level === "DISTRICT")
      return [
        { id: "villages" as Tab, label: tr("geoSubdistricts") },
        { id: "towns" as Tab, label: tr("geoTowns") },
        { id: "localBodies" as Tab, label: tr("geoLocalBodies") },
      ];
    if (step.level === "SUBDISTRICT")
      return [
        { id: "villages" as Tab, label: tr("geoVillages") },
        { id: "towns" as Tab, label: tr("geoTowns") },
      ];
    return null;
  }, [step.level, tr]);

  // ── Pieces ────────────────────────────────────────────────────────────────

  const searchBox = (
    <View style={styles.search}>
      <Search size={18} color={colors.faint} />
      <TextInput
        accessibilityLabel={tr("searchLocations")}
        placeholder={tr("searchLocations")}
        placeholderTextColor={colors.faint}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.searchInput}
        returnKeyType="search"
      />
      {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      {query ? <IconButton icon={X} label={tr("clear")} onPress={() => setQuery("")} size={36} /> : null}
    </View>
  );

  const searchResults =
    results === null ? null : (
      <View style={{ gap: space.sm }}>
        {searchOfflineMode ? <Banner icon={CloudOff} text={tr("geoOfflineSaved")} /> : null}
        {offices.length ? (
          <View style={{ gap: 6 }}>
            <Text style={styles.section}>{tr("pincodeOffices", { pin: query.trim() })}</Text>
            {new Set(offices.map((o) => o.district?.id).filter(Boolean)).size > 1 ? (
              <Banner icon={MapPin} text={tr("pincodeMultiDistrict")} tone="amber" />
            ) : null}
            {offices.map((o) => {
              const unit = o.subdistrict ?? o.district ?? o.state;
              return (
                <Row
                  key={`${o.pincode}-${o.office}`}
                  title={o.office}
                  subtitle={unit ? where(unit) : `${o.sourceDistrict ?? ""}, ${o.sourceState ?? ""}`}
                  badge={unit ? unit.levelLabel : tr("geoUnmatched")}
                  disabled={!unit}
                  onPress={() => unit && choose(unit)}
                />
              );
            })}
          </View>
        ) : null}
        {results.length === 0 && !offices.length && !searching ? (
          <Empty title={tr("noLocations")} body={tr("noLocationsBody")} />
        ) : (
          results.map((u) => (
            <Row
              key={u.id}
              title={u.name}
              subtitle={where(u)}
              badge={u.levelLabel}
              hint={u.matchedAlias ? tr("geoAlsoKnown", { name: u.matchedAlias }) : u.localName ?? undefined}
              onPress={() => choose(u)}
            />
          ))
        )}
      </View>
    );

  const quick = (
    <View style={{ gap: space.md }}>
      {assigned ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.section}>{tr("yourArea")}</Text>
          <Row icon={MapPin} title={assigned.name} subtitle={where(assigned)} badge={assigned.levelLabel} onPress={() => choose(assigned)} />
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => void findNearby()}
        style={(s) => [styles.nearbyBtn, s.pressed && { opacity: 0.85 }]}
      >
        <View style={styles.nearbyIcon}>
          {nearbyBusy ? <ActivityIndicator size="small" color={colors.primaryDark} /> : <Crosshair size={18} color={colors.primaryDark} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{tr("useCurrentLocation")}</Text>
          <Text style={type.caption}>
            {app.live ? tr("geoAccuracy", { m: Math.round(app.live.accuracyM) }) : tr("geoNearbyNoFix")}
          </Text>
        </View>
      </Pressable>
      {nearby ? (
        <View style={{ gap: 6 }}>
          {nearby.weak ? <Banner icon={Crosshair} text={tr("geoNearbyWeak")} tone="amber" /> : null}
          {nearby.note ? <Text style={type.meta}>{nearby.note}</Text> : null}
          {nearby.items.map((u) => (
            <Row key={`n-${u.id}`} title={u.name} subtitle={where(u)} badge={u.levelLabel}
                 hint={u.distanceKm != null ? `${u.distanceKm} km` : undefined} onPress={() => choose(u)} />
          ))}
        </View>
      ) : null}
      {recent.length ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.section}>{tr("recentLocations")}</Text>
          {recent.slice(0, 6).map((u) => (
            <Row key={`r-${u.id}`} icon={History} title={u.name} subtitle={where(u)} badge={u.levelLabel} onPress={() => choose(u)} />
          ))}
        </View>
      ) : null}
      {recentQ.length ? (
        <View style={styles.chips}>
          {recentQ.map((q) => (
            <Pressable key={q} accessibilityRole="button" onPress={() => setQuery(q)} style={styles.qChip}>
              <Clock size={12} color={colors.muted} />
              <Text style={styles.qChipText}>{q}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  const browse = (
    <View style={{ flex: 1, gap: space.sm }}>
      <View style={styles.crumbs} accessibilityRole="list">
        {trail.map((s, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center" }}>
            {i > 0 ? <ChevronRight size={14} color={colors.faint} /> : null}
            <Pressable accessibilityRole="button" onPress={() => goTo(i)} disabled={i === trail.length - 1} hitSlop={6}>
              <Text style={[styles.crumb, i === trail.length - 1 && styles.crumbOn]} numberOfLines={1}>
                {s.unit ? s.unit.name : tr("india")}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
      {step.unit ? (
        <Button
          variant="secondary"
          compact
          icon={MapPin}
          label={tr("selectThis", { name: step.unit.name })}
          onPress={() => choose(step.unit!)}
        />
      ) : null}
      {tabs ? <SegmentedControl options={tabs} value={tab} onChange={setTab} /> : null}
      {offline ? <Banner icon={CloudOff} text={tr("geoOfflineSaved")} /> : null}
      {error && !rows.length ? (
        <View style={{ gap: space.sm }}>
          <Banner icon={CloudOff} text={error} tone="red" />
          <Button compact variant="secondary" label={tr("retry")} onPress={() => void load(0)} />
        </View>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(u) => u.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 6, paddingBottom: space.lg }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        windowSize={7}
        renderItem={({ item }) => {
          const drillable = !!nextStep(item);
          return (
            <Row
              title={item.name}
              subtitle={item.localName ?? undefined}
              badge={item.levelLabel}
              chevron={drillable}
              onPress={() => (drillable ? drill(item) : choose(item))}
            />
          );
        }}
        ListEmptyComponent={loading ? <Skeleton /> : error ? null : <Empty title={step.level === "ROOT" ? tr("geoNotLoaded") : tr("noLocations")} />}
        ListFooterComponent={
          next != null ? (
            <Button compact variant="ghost" label={tr("loadMore")} loading={loading} onPress={() => void load(next)} />
          ) : null
        }
      />
    </View>
  );

  const chain = pending ? pending.hierarchy.split(" → ") : [];
  const summary = (
    <View style={{ gap: space.md }}>
      <Text style={styles.section}>{tr("selectedLocation")}</Text>
      {pending ? (
        <View style={[styles.summary, elevation[1]]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
            <Text style={[type.heading, { flexShrink: 1 }]}>{pending.name}</Text>
            <Badge label={pending.levelLabel} tone="peach" />
          </View>
          {pending.localName ? <Text style={type.meta}>{pending.localName}</Text> : null}
          <View style={{ gap: 4 }}>
            {chain.slice(1).map((n, i) => (
              <View key={`${n}-${i}`} style={styles.chainRow}>
                <View style={styles.chainDot} />
                <Text style={type.meta}>{n}</Text>
              </View>
            ))}
          </View>
          {pending.code ? <Text style={type.caption}>{tr("geoOfficialCode", { code: pending.code })}</Text> : null}
        </View>
      ) : (
        <Text style={type.meta}>{tr("nothingSelected")}</Text>
      )}
      <Button label={tr("confirmSelection")} icon={MapPin} disabled={!pending} onPress={confirm} />
      {pending ? <Button compact variant="plain" label={tr("clearSelection")} onPress={() => setPending(null)} /> : null}
    </View>
  );

  // Phones and tablets: a sticky bar at the bottom of the sheet once something is picked.
  const confirmBar = pending ? (
    <View style={styles.confirmBar}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {pending.name} · {pending.levelLabel}
        </Text>
        <Text style={type.caption} numberOfLines={1}>
          {where(pending)}
        </Text>
      </View>
      <Button compact label={tr("confirmSelection")} onPress={confirm} />
    </View>
  ) : null;

  const header = (
    <View style={styles.header}>
      <Text style={type.title} accessibilityRole="header">
        {title ?? tr("chooseLocation")}
      </Text>
      <IconButton icon={X} label={tr("close")} onPress={onClose} />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType={twoPane ? "fade" : "slide"} onRequestClose={onClose}>
      <View style={[styles.backdrop, !twoPane && styles.backdropSheet]}>
        <View
          style={[
            styles.panel,
            elevation[3],
            twoPane
              ? { width: "100%", maxWidth: l.isDesktop ? 1040 : 900, height: "86%" }
              : { width: "100%", height: "92%", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: Math.max(insets.bottom, space.lg) },
          ]}
          accessibilityViewIsModal
        >
          {!twoPane ? <View style={styles.grabber} /> : null}
          {header}
          {twoPane ? (
            <View style={styles.panes}>
              <View style={[styles.pane, { flex: 1.1 }]}>{browse}</View>
              <View style={[styles.pane, styles.paneSide]}>
                {searchBox}
                <FlatList data={[0]} keyExtractor={() => "s"} keyboardShouldPersistTaps="handled" renderItem={() => searchResults ?? quick} />
              </View>
              {threePane ? <View style={[styles.pane, styles.paneSide, { flex: 0.8 }]}>{summary}</View> : null}
            </View>
          ) : (
            <View style={{ flex: 1, gap: space.md }}>
              {searchBox}
              {results !== null ? (
                <FlatList data={[0]} keyExtractor={() => "s"} keyboardShouldPersistTaps="handled" renderItem={() => searchResults} />
              ) : (
                <View style={{ flex: 1, gap: space.md }}>
                  {quick}
                  <Text style={styles.section}>{tr("browseByArea")}</Text>
                  {browse}
                </View>
              )}
            </View>
          )}
          {!threePane ? confirmBar : null}
        </View>
      </View>
    </Modal>
  );
}

/** Form field that shows the chosen place with its hierarchy and opens the picker. */
export function LocationField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: GeoUnit | null;
  onChange: (unit: GeoUnit | null) => void;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${value.name}, ${value.hierarchy}` : `${label}: ${tr("chooseLocation")}`}
        onPress={() => setOpen(true)}
        style={(s) => [styles.field, value && styles.fieldSet, s.pressed && { opacity: 0.85 }]}
      >
        <MapPin size={18} color={value ? colors.primaryDark : colors.faint} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.rowTitle, !value && { color: colors.faint, fontWeight: "500" }]} numberOfLines={1}>
            {value ? value.name : tr("chooseLocation")}
          </Text>
          {value ? (
            <Text style={type.caption} numberOfLines={2}>
              {value.levelLabel} · {where(value)}
            </Text>
          ) : null}
        </View>
        <Text style={styles.change}>{value ? tr("change") : tr("geoChoose")}</Text>
      </Pressable>
      {value ? <Button compact variant="plain" label={tr("clearSelection")} onPress={() => onChange(null)} /> : hint ? <Text style={type.caption}>{hint}</Text> : null}
      <LocationPicker visible={open} title={label} onClose={() => setOpen(false)} onSelect={(u) => onChange(u)} />
    </View>
  );
}

function Row({
  title,
  subtitle,
  badge,
  hint,
  chevron,
  icon: Icon,
  disabled,
  onPress,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  hint?: string;
  chevron?: boolean;
  icon?: LucideIcon;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, badge, subtitle].filter(Boolean).join(", ")}
      disabled={disabled}
      onPress={onPress}
      style={(s) => {
        const st = s as { pressed: boolean; hovered?: boolean; focused?: boolean };
        return [styles.row, st.hovered && styles.rowHover, st.pressed && { opacity: 0.8 }, st.focused && styles.focus, disabled && { opacity: 0.5 }];
      }}
    >
      {Icon ? <Icon size={16} color={colors.muted} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {title}
          </Text>
          {badge ? <Badge label={badge} tone="slate" /> : null}
        </View>
        {subtitle ? (
          <Text style={type.caption} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {hint ? <Text style={[type.caption, { color: colors.primaryDark }]}>{hint}</Text> : null}
      </View>
      {chevron ? <ChevronRight size={18} color={colors.faint} /> : null}
    </Pressable>
  );
}

function Banner({ icon: Icon, text, tone = "slate" }: { icon: LucideIcon; text: string; tone?: "slate" | "amber" | "red" }) {
  const bg = tone === "amber" ? colors.warningBg : tone === "red" ? colors.dangerBg : colors.surfaceMuted;
  const fg = tone === "amber" ? colors.warningInk : tone === "red" ? colors.dangerInk : colors.muted;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      <Icon size={15} color={fg} />
      <Text style={[type.caption, { color: fg, flex: 1 }]}>{text}</Text>
    </View>
  );
}

function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={{ alignItems: "center", gap: 6, paddingVertical: space.xl }}>
      <MapPin size={22} color={colors.primaryDark} />
      <Text style={[type.heading, { textAlign: "center" }]}>{title}</Text>
      {body ? <Text style={[type.meta, { textAlign: "center", maxWidth: 320 }]}>{body}</Text> : null}
    </View>
  );
}

function Skeleton() {
  return (
    <View style={{ gap: 8 }} accessibilityLabel="Loading">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.skel, { width: `${92 - (i % 3) * 14}%` }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,33,61,0.42)", alignItems: "center", justifyContent: "center", padding: space.lg },
  backdropSheet: { justifyContent: "flex-end", padding: 0 },
  panel: { backgroundColor: colors.bg, borderRadius: radii.hero, padding: space.lg, gap: space.md, overflow: "hidden" },
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: colors.lineStrong, marginTop: -4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  panes: { flex: 1, flexDirection: "row", gap: space.lg },
  pane: { flex: 1, minWidth: 0 },
  paneSide: { gap: space.md, borderLeftWidth: 1, borderLeftColor: colors.line, paddingLeft: space.lg },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.ink, paddingVertical: 10, ...Platform.select({ web: { outlineStyle: "none" } as object, default: {} }) },
  section: { fontSize: 14, fontWeight: "800", color: colors.muted, marginTop: space.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    minHeight: 52,
  },
  rowHover: { borderColor: colors.peachBorder, backgroundColor: colors.surfaceMuted },
  focus: { outlineWidth: 2, outlineColor: colors.primary, outlineStyle: "solid" } as object,
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.ink, flexShrink: 1 },
  crumbs: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
  crumb: { fontSize: 14, fontWeight: "700", color: colors.primaryDark, paddingVertical: 6, paddingHorizontal: 2 },
  crumbOn: { color: colors.ink },
  nearbyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: space.md,
    minHeight: 56,
  },
  nearbyIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  banner: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radii.sm, padding: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  qChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, minHeight: 36 },
  qChipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  skel: { height: 52, borderRadius: radii.md, backgroundColor: "#F3EADF" },
  summary: { backgroundColor: colors.white, borderRadius: radii.lg, padding: space.lg, gap: space.sm },
  chainRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  chainDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.peachBorder },
  confirmBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.peachBorder,
    padding: space.md,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    borderRadius: radii.button,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  fieldSet: { borderColor: colors.peachBorder, backgroundColor: colors.surfaceMuted },
  change: { fontSize: 14, fontWeight: "800", color: colors.primaryDark },
});
