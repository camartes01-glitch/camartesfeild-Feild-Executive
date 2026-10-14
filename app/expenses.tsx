import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { CircleParking, Fuel, Receipt, RefreshCw, Route, Utensils, Wallet, type LucideIcon } from "lucide-react-native";
import { ChoiceCard } from "@/components/chips";
import { showDialog } from "@/components/dialog";
import { FieldGate } from "@/components/field-gate";
import { SyncBar, useT } from "@/components/status";
import { Badge, Button, Card, Columns, EmptyState, ErrorState, Field, FormSection, IconButton, IconCircle, Screen, SectionHeader } from "@/components/ui";
import { colors, radii, space, type } from "@/constants/theme";
import { headerOptions } from "@/constants/nav";
import { useApp } from "@/lib/app-context";
import { errorText, type I18nKey } from "@/lib/i18n";
import { OPS } from "@/lib/ops-api";

type Expense = { id: string; note: string | null; amountInr: number; km: number | null; date: string; status: string; category: string };
const CATEGORIES = ["travel", "fuel", "parking", "food", "other"] as const;
type Category = (typeof CATEGORIES)[number];

function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export default function ExpensesScreen() {
  return (
    <FieldGate>
      <Expenses />
    </FieldGate>
  );
}

/** Travel expense claims. The server validates and stores them; managers review them in the console. */
function Expenses() {
  const { get, submitTracked, online, queue, language, retryQueued, discardQueued } = useApp();
  const tr = useT();
  const [rows, setRows] = useState<Expense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [date, setDate] = useState(istToday());
  const [note, setNote] = useState("");
  const [km, setKm] = useState("");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await get<{ expenses: Expense[] }>(`${OPS}/expenses`);
    setLoading(false);
    if (res.ok) {
      setRows(res.body.expenses);
      setError(null);
    } else {
      setError(errorText(language, res.code, res.message));
    }
  }, [get, language]);

  useEffect(() => {
    void load();
  }, [load, online]);

  const amount = Number(amt.replace(",", "."));
  const kmValue = km.trim() ? Number(km.replace(",", ".")) : null;
  const problems: string[] = [];
  if (!category) problems.push(tr("err_EXPENSE_CATEGORY_INVALID"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) problems.push(tr("err_EXPENSE_DATE_INVALID"));
  else if (date > istToday()) problems.push(tr("err_EXPENSE_DATE_IN_FUTURE"));
  if (!(amount > 0 && amount <= 100_000)) problems.push(tr("err_EXPENSE_AMOUNT_INVALID"));
  if (note.trim().length < 3) problems.push(tr("err_EXPENSE_NOTE_REQUIRED"));
  if (kmValue !== null && !(kmValue >= 0 && kmValue <= 2000)) problems.push(tr("err_EXPENSE_KM_INVALID"));

  async function submit() {
    if (submitting.current || problems.length) return;
    submitting.current = true;
    setBusy(true);
    const outcome = await submitTracked({
      label: `${tr("travelExpenses")} ₹${amount}`,
      entityKey: "expense",
      path: `${OPS}/expenses`,
      body: { category, amountInr: amount, km: kmValue, note: note.trim(), date },
      idempotencyKey: `expense:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    });
    submitting.current = false;
    setBusy(false);
    if (outcome.state === "REJECTED" || outcome.state === "REFUSED") {
      return showDialog(tr("travelExpenses"), errorText(language, outcome.code, outcome.message));
    }
    showDialog(tr("travelExpenses"), outcome.state === "SYNCED" ? tr("expenseSubmitted", { id: outcome.serverId ?? "" }) : tr("queuedOffline"));
    setNote("");
    setKm("");
    setAmt("");
    setCategory(null);
    setDate(istToday());
    void load();
  }

  const unsynced = queue.filter((q) => q.path === `${OPS}/expenses` && q.status !== "SYNCED");
  const touched = !!(category || note || amt);
  const amountError = amt && !(amount > 0 && amount <= 100_000) ? tr("err_EXPENSE_AMOUNT_INVALID") : null;
  const dateError = !/^\d{4}-\d{2}-\d{2}$/.test(date) ? tr("err_EXPENSE_DATE_INVALID") : date > istToday() ? tr("err_EXPENSE_DATE_IN_FUTURE") : null;
  const kmError = kmValue !== null && !(kmValue >= 0 && kmValue <= 2000) ? tr("err_EXPENSE_KM_INVALID") : null;
  const total = (rows ?? []).reduce((sum, e) => sum + (e.status !== "rejected" ? e.amountInr : 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: true, title: tr("travelExpenses"), headerBackTitle: tr("profile"), ...headerOptions }} />
      <SyncBar />
      <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} bottomInset={space.xxl}>
        <Columns
          main={
            <>
              <FormSection step={1} title={tr("newExpense")} done={problems.length === 0}>
                <Text style={type.label}>
                  {tr("expenseCategory")}
                  <Text style={{ color: colors.primaryDark }}> *</Text>
                </Text>
                <View style={styles.choices}>
                  {CATEGORIES.map((c) => (
                    <ChoiceCard key={c} icon={CAT_ICON[c]} label={tr(`expcat_${c}` as I18nKey)} selected={category === c} onPress={() => setCategory(c)} />
                  ))}
                </View>
                <View style={styles.pair}>
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <Field label={tr("expenseAmount")} required value={amt} onChangeText={setAmt} keyboardType="decimal-pad" error={amountError} placeholder="120" />
                  </View>
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <Field label={tr("expenseDate")} required value={date} onChangeText={(v) => setDate(v.trim())} placeholder="YYYY-MM-DD" maxLength={10} error={dateError} />
                  </View>
                </View>
                <Field label={tr("expenseNote")} required value={note} onChangeText={setNote} placeholder={tr("expenseNoteHint")} />
                <Field label={tr("expenseKm")} value={km} onChangeText={setKm} keyboardType="decimal-pad" error={kmError} />
                {problems.length && touched ? (
                  <View style={styles.problems}>
                    {problems.map((p) => (
                      <Text key={p} style={styles.why}>
                        • {p}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <View style={styles.note}>
                  <Receipt size={16} color={colors.muted} />
                  <Text style={[type.caption, { flex: 1 }]}>{tr("expenseReceiptNote")}</Text>
                </View>
                <Button label={tr("submitExpense")} icon={Wallet} loading={busy} disabled={busy || problems.length > 0} onPress={() => void submit()} />
              </FormSection>

              {unsynced.map((q) => (
                <Card key={q.id} tone={q.status === "FAILED" ? "danger" : "muted"}>
                  <View style={styles.rowBetween}>
                    <Text style={[type.heading, { flex: 1 }]} numberOfLines={1}>
                      {String(q.body.note ?? q.label)}
                    </Text>
                    <Badge label={q.status === "FAILED" ? tr("rejected") : tr("pendingSync")} tone={q.status === "FAILED" ? "red" : "blue"} dot />
                  </View>
                  {q.status === "FAILED" ? (
                    <>
                      <Text style={type.meta}>{errorText(language, q.lastCode, q.lastError ?? "")}</Text>
                      <View style={styles.pair}>
                        <Button compact flex={1} label={tr("retry")} variant="secondary" onPress={() => retryQueued(q.id)} />
                        <Button compact flex={1} label={tr("discard")} variant="ghost" onPress={() => discardQueued(q.id)} />
                      </View>
                    </>
                  ) : null}
                </Card>
              ))}
            </>
          }
          side={
            <>
              <Card padding={space.md}>
                <SectionHeader
                  title={tr("myExpenses")}
                  icon={Wallet}
                  count={rows?.length}
                  action={<IconButton icon={RefreshCw} label={tr("refresh")} onPress={() => void load()} />}
                />
                {rows && rows.length ? <Text style={type.meta}>{tr("expenseTotal", { amount: total.toLocaleString("en-IN") })}</Text> : null}
                {error ? <ErrorState message={error} onRetry={() => void load()} retryLabel={tr("retry")} /> : null}
                {rows === null && !error ? <Text style={type.meta}>{tr("loading")}</Text> : null}
                {rows && rows.length === 0 ? <EmptyState icon={Wallet} title={tr("noExpenses")} /> : null}
                {(rows ?? []).map((e) => (
                  <View key={e.id} style={styles.claim}>
                    <IconCircle icon={CAT_ICON[e.category as Category] ?? Receipt} tone="slate" size={36} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.body, { fontWeight: "700" }]} numberOfLines={1}>
                        {e.note}
                      </Text>
                      <Text style={type.caption}>
                        {e.date} · {tr(`expcat_${e.category}` as I18nKey)}
                        {e.km ? ` · ${e.km} km` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={styles.amt}>₹{e.amountInr.toLocaleString("en-IN")}</Text>
                      <Badge label={tr(`expstatus_${e.status}` as I18nKey)} tone={e.status === "approved" ? "green" : e.status === "rejected" ? "red" : "amber"} dot />
                    </View>
                  </View>
                ))}
              </Card>
            </>
          }
          sideWidth={400}
        />
      </Screen>
    </View>
  );
}

const CAT_ICON: Record<Category, LucideIcon> = { travel: Route, fuel: Fuel, parking: CircleParking, food: Utensils, other: Receipt };

const styles = StyleSheet.create({
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pair: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  problems: { backgroundColor: colors.warningBg, borderRadius: radii.md, padding: space.md, gap: 4 },
  why: { color: colors.warningInk, fontWeight: "600", fontSize: 13 },
  note: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  claim: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.line },
  amt: { fontSize: 16, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"] },
});
