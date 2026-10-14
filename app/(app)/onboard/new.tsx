import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Aperture, Camera, CircleCheck, Clapperboard, ImagePlus, MonitorPlay, Palette, Radio, Video, X, type LucideIcon } from "lucide-react-native";
import { Badge, Button, Card, Columns, Field, FormSection, ProgressBar, StickyFooter } from "@/components/ui";
import { Chip, ChipWrap, ChoiceCard } from "@/components/chips";
import { showDialog } from "@/components/dialog";
import { GeoCamera } from "@/components/geo-camera";
import { GpsLine, useT } from "@/components/status";
import { colors, radii, space, type as tx } from "@/constants/theme";
import { useLayout } from "@/lib/responsive";
import { useApp } from "@/lib/app-context";
import type { GeoUnit } from "@/lib/geography";
import { LocationField } from "@/components/location-picker";
import { isStaleFix } from "@/lib/geo";
import { errorText, type I18nKey } from "@/lib/i18n";
import type { CapturedImage } from "@/lib/media-store";
import { OPS } from "@/lib/ops-api";
import type { Partner, PartnerType, VisitStatus } from "@/lib/types";

const TYPES: PartnerType[] = [
  "PHOTOGRAPHY_STUDIO",
  "FREELANCE_PHOTOGRAPHER",
  "VIDEOGRAPHER",
  "ALBUM_DESIGNER",
  "VIDEO_EDITOR",
  "LED_WALL_PARTNER",
  "WEBLIVE_PARTNER",
];
const STATUSES: VisitStatus[] = ["INTERESTED", "NEED_TIME", "NOT_INTERESTED", "FOLLOW_UP", "ONBOARDED"];
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const MOBILE = /^(?:\+?91|0)?[6-9]\d{9}$/;

/** "YYYY-MM-DD HH:MM" in IST → ISO string, or null. */
function parseMeeting(value: string): string | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "11"}:${m[5] ?? "00"}:00+05:30`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

export default function NewVisitScreen() {
  const { partnerId } = useLocalSearchParams<{ partnerId?: string }>();
  const app = useApp();
  const tr = useT();
  const l = useLayout();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [type, setType] = useState<PartnerType | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<VisitStatus | null>(null);
  const [gst, setGst] = useState<boolean | null>(null);
  const [gstin, setGstin] = useState("");
  const [meeting, setMeeting] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<CapturedImage[]>([]);
  const [area, setArea] = useState<GeoUnit | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false); // a double tap must never file the visit twice

  useEffect(() => {
    if (!partnerId) return;
    void app.get<{ partners: Partner[] }>(`${OPS}/onboard/partners`).then((res) => {
      const found = res.ok ? res.body.partners.find((p) => p.id === partnerId) : undefined;
      if (!found) return;
      setPartner(found);
      setType(found.partnerType);
      setName(found.businessName);
      setContact(found.contactPerson);
      setPhone(found.phone ?? "");
      setAddress(found.address ?? "");
      setGst(found.gstAvailable);
      setGstin(found.gstNumber ?? "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  const needsMeeting = status === "FOLLOW_UP" || status === "NEED_TIME";
  const meetingIso = parseMeeting(meeting);
  const problems: I18nKey[] = [];
  if (!type) problems.push("err_INVALID_PARTNER_TYPE");
  if (!name.trim()) problems.push("err_BUSINESS_NAME_REQUIRED");
  if (!contact.trim()) problems.push("err_CONTACT_PERSON_REQUIRED");
  if (!status) problems.push("err_VISIT_STATUS_REQUIRED");
  if (gst === null) problems.push("err_GST_MUST_ASK");
  if (gst && !GSTIN.test(gstin.trim().toUpperCase())) problems.push("err_GST_NUMBER_INVALID");
  if (needsMeeting && !meetingIso) problems.push("err_NEXT_MEETING_REQUIRED");
  else if (meetingIso && Date.parse(meetingIso) <= Date.now()) problems.push("err_NEXT_MEETING_IN_PAST");
  if (!partner && phone.trim() && !MOBILE.test(phone.replace(/[\s-]/g, ""))) problems.push("err_PHONE_INVALID");
  if (!partner && address.trim() && address.trim().length < 5) problems.push("err_ADDRESS_TOO_SHORT");
  if (!app.live) problems.push("err_GPS_REQUIRED");
  else if (isStaleFix(app.live)) problems.push("err_GPS_STALE");
  const weakGps = !!app.live && app.live.accuracyM > (app.config?.rules.maxGpsAccuracyM ?? 100);

  async function save() {
    if (submitting.current || problems.length) return;
    submitting.current = true;
    setBusy(true);
    const outcome = await app.saveVisit({
      partnerId: partner?.id,
      partnerType: type!,
      businessName: name,
      contactPerson: contact,
      phone,
      address,
      visitStatus: status!,
      gstAvailable: gst,
      gstNumber: gst ? gstin : "",
      nextMeetingAt: meeting.trim() ? meetingIso : null,
      notes,
      photos,
      geoUnitId: area?.id ?? null,
    });
    submitting.current = false;
    setBusy(false);
    if (outcome.state === "REJECTED" || outcome.state === "REFUSED") {
      // Nothing was saved: keep everything the employee typed so they can fix it and try again.
      return showDialog(tr("newVisit"), errorText(app.language, outcome.code, outcome.message));
    }
    showDialog(
      tr("visitSaved"),
      outcome.state === "SYNCED" ? tr("visitSavedId", { id: outcome.serverId ?? "" }) : tr("queuedOffline"),
    );
    router.back();
  }

  // Step completion drives the progress bar; required items remain listed until done.
  const steps = [
    { title: tr("partnerType"), done: !!type },
    { title: tr("visitStepBusiness"), done: !!name.trim() && !problems.includes("err_ADDRESS_TOO_SHORT") },
    { title: tr("visitStepContact"), done: !!contact.trim() && !problems.includes("err_PHONE_INVALID") },
    { title: tr("visitStepLocation"), done: !!app.live && !isStaleFix(app.live) },
    { title: tr("visitPhotos"), done: photos.length > 0 },
    { title: tr("visitStatus"), done: !!status && !problems.includes("err_NEXT_MEETING_REQUIRED") && !problems.includes("err_NEXT_MEETING_IN_PAST") },
    { title: tr("gstAsk"), done: gst !== null && !problems.includes("err_GST_NUMBER_INVALID") },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const phoneError = problems.includes("err_PHONE_INVALID") ? tr("err_PHONE_INVALID") : null;
  const addressError = problems.includes("err_ADDRESS_TOO_SHORT") ? tr("err_ADDRESS_TOO_SHORT") : null;
  const gstError = gst && gstin.trim().length >= 15 && problems.includes("err_GST_NUMBER_INVALID") ? tr("err_GST_NUMBER_INVALID") : null;

  const saveButton = (
    <Button label={tr("saveVisit")} icon={CircleCheck} loading={busy} disabled={busy || problems.length > 0} onPress={() => void save()} />
  );
  const checklist = problems.length ? (
    <View style={styles.problems} accessibilityLiveRegion="polite">
      {problems.map((p) => (
        <Text key={p} style={styles.problem}>
          • {tr(p)}
        </Text>
      ))}
    </View>
  ) : (
    <Badge label={tr("visitReady")} tone="green" icon={CircleCheck} />
  );

  const form = (
    <>
      <Card padding={space.md}>
        <View style={styles.rowBetween}>
          <Text style={tx.label}>{tr("visitProgress", { n: doneCount, total: steps.length })}</Text>
          {partner ? <Badge label={tr("existingPartner")} tone="blue" /> : null}
        </View>
        <ProgressBar value={doneCount / steps.length} tone={doneCount === steps.length ? "green" : "peach"} />
      </Card>

      <FormSection step={1} title={tr("partnerType")} done={steps[0].done}>
        <View style={styles.choices}>
          {TYPES.map((p) => (
            <ChoiceCard key={p} icon={TYPE_ICON[p]} label={tr(`ptype_${p}` as I18nKey)} selected={type === p} disabled={!!partner} onPress={() => !partner && setType(p)} />
          ))}
        </View>
      </FormSection>

      <FormSection step={2} title={tr("visitStepBusiness")} done={steps[1].done}>
        <Field label={tr("businessName")} required value={name} onChangeText={setName} editable={!partner} placeholder={tr("businessNameHint")} />
        <Field label={tr("address")} value={address} onChangeText={setAddress} multiline editable={!partner} error={addressError} placeholder={tr("addressHint")} />
      </FormSection>

      <FormSection step={3} title={tr("visitStepContact")} done={steps[2].done}>
        <Field label={tr("contactPerson")} required value={contact} onChangeText={setContact} editable={!partner} autoComplete="name" />
        <Field label={tr("phone")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={!partner} error={phoneError} autoComplete="tel" placeholder="98480 22338" />
      </FormSection>

      <FormSection step={4} title={tr("visitStepLocation")} done={steps[3].done}>
        <GpsLine />
        <Text style={tx.meta}>{tr("gpsRecorded")}</Text>
        {weakGps ? <Badge label={tr("visitWeakGps", { m: Math.round(app.live!.accuracyM) })} tone="amber" /> : null}
        <LocationField label={tr("locationArea")} hint={tr("locationAreaHint")} value={area} onChange={setArea} />
      </FormSection>

      <FormSection step={5} title={tr("visitPhotos")} done={steps[4].done}>
        <View style={styles.thumbs}>
          {photos.map((ph, i) => (
            <View key={ph.ref} style={styles.thumbWrap}>
              <Image source={{ uri: ph.previewUri }} style={styles.thumb} />
              <Pressable accessibilityRole="button" accessibilityLabel={tr("removePhoto")} onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))} hitSlop={8} style={styles.remove}>
                <X size={14} color={colors.white} />
              </Pressable>
            </View>
          ))}
          <View style={styles.addPhoto}>
            <ImagePlus size={22} color={colors.primaryDark} />
            <Text style={tx.caption}>{tr("photoCount", { n: photos.length })}</Text>
          </View>
        </View>
        <GeoCamera label={tr("addPhoto")} onCaptured={(img) => setPhotos((p) => [...p, img].slice(0, 10))} />
      </FormSection>

      <FormSection step={6} title={tr("visitStatus")} done={steps[5].done}>
        <ChipWrap>
          {STATUSES.map((st) => (
            <Chip key={st} label={tr(`status_${st}` as I18nKey)} selected={status === st} onPress={() => setStatus(st)} />
          ))}
        </ChipWrap>
        {needsMeeting || meeting ? (
          <Field
            label={tr("nextMeeting")}
            required={needsMeeting}
            value={meeting}
            onChangeText={setMeeting}
            placeholder="2026-10-02 11:00"
            error={problems.includes("err_NEXT_MEETING_IN_PAST") ? tr("err_NEXT_MEETING_IN_PAST") : null}
          />
        ) : null}
        <Field label={tr("notes")} value={notes} onChangeText={setNotes} multiline />
      </FormSection>

      <FormSection step={7} title={tr("gstAsk")} done={steps[6].done}>
        <ChipWrap>
          <Chip label={tr("yes")} selected={gst === true} onPress={() => setGst(true)} />
          <Chip label={tr("no")} selected={gst === false} onPress={() => setGst(false)} />
        </ChipWrap>
        {gst ? (
          <Field label={tr("gstNumber")} required value={gstin} onChangeText={(v) => setGstin(v.toUpperCase())} autoCapitalize="characters" maxLength={15} error={gstError} placeholder="36AABCU9603R1ZM" />
        ) : null}
      </FormSection>
    </>
  );

  // Phones: sticky Save bar. Tablet/laptop: right-side summary with the checklist and Save.
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: l.pad, paddingTop: space.lg, paddingBottom: l.twoCol ? space.xxl : 190 }}>
        <View style={{ width: "100%", maxWidth: l.maxWidth, alignSelf: "center" }}>
          <Columns
            main={form}
            side={
              l.twoCol ? (
                <Card elevated>
                  <Text style={tx.heading}>{tr("visitSummary")}</Text>
                  <Text style={tx.meta}>{name.trim() || tr("businessName")}</Text>
                  {type ? <Badge label={tr(`ptype_${type}` as I18nKey)} tone="peach" /> : null}
                  {checklist}
                  {saveButton}
                </Card>
              ) : null
            }
          />
        </View>
      </ScrollView>
      {!l.twoCol ? (
        <StickyFooter>
          {problems.length ? (
            <Text style={styles.footerHint}>
              {tr("visitRemaining", { n: problems.length })}: {tr(problems[0])}
            </Text>
          ) : null}
          {saveButton}
        </StickyFooter>
      ) : null}
    </View>
  );
}

const TYPE_ICON: Record<PartnerType, LucideIcon> = {
  PHOTOGRAPHY_STUDIO: Aperture,
  FREELANCE_PHOTOGRAPHER: Camera,
  VIDEOGRAPHER: Video,
  ALBUM_DESIGNER: Palette,
  VIDEO_EDITOR: Clapperboard,
  LED_WALL_PARTNER: MonitorPlay,
  WEBLIVE_PARTNER: Radio,
};

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  problems: { backgroundColor: colors.warningBg, borderRadius: radii.md, padding: space.md, gap: 4 },
  problem: { color: colors.warningInk, fontWeight: "600", fontSize: 13 },
  footerHint: { fontSize: 12, fontWeight: "600", color: colors.warningInk, textAlign: "center" },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  thumbWrap: { position: "relative" },
  thumb: { width: 84, height: 84, borderRadius: radii.sm, backgroundColor: colors.peach },
  remove: { position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  addPhoto: { width: 84, height: 84, borderRadius: radii.sm, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.peachBorder, alignItems: "center", justifyContent: "center", gap: 4, padding: 4 },
});
