const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Cache transpiled modules
const moduleCache = new Map();

function loadTsModule(relativeFilePath) {
  const absolutePath = path.resolve(__dirname, relativeFilePath);
  if (moduleCache.has(absolutePath)) {
    return moduleCache.get(absolutePath).exports;
  }

  const code = fs.readFileSync(absolutePath, "utf8");
  const transpiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  });

  const moduleObj = { exports: {} };
  moduleCache.set(absolutePath, moduleObj);

  const customRequire = (id) => {
    if (id === "react-native") return { Platform: { OS: "android" } };
    if (id === "expo-constants") return { default: { expoConfig: {} } };
    if (id === "expo-router") return { router: new Proxy({}, { get: (_, key) => globalThis.__routerMock[key] }) };
    if (id === "date-fns") return require("date-fns");
    if (id.endsWith(".json")) {
      const jsonPath = id.startsWith("@/")
        ? path.resolve(__dirname, "..", id.replace("@/", ""))
        : path.resolve(path.dirname(absolutePath), id);
      return require(jsonPath);
    }
    if (id.startsWith("@/lib/")) {
      const rel = `../lib/${id.replace("@/lib/", "")}.ts`;
      return loadTsModule(rel);
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const dir = path.dirname(absolutePath);
      let target = path.resolve(dir, id);
      if (fs.existsSync(target + ".json")) return require(target + ".json");
      if (fs.existsSync(target + ".ts")) target = target + ".ts";
      else if (fs.existsSync(target + ".tsx")) target = target + ".tsx";
      else if (fs.existsSync(target)) return require(target);
      return loadTsModule(path.relative(__dirname, target));
    }
    return require(id);
  };

  const fn = new Function("exports", "require", "module", "__filename", "__dirname", transpiled.outputText);
  fn(moduleObj.exports, customRequire, moduleObj, absolutePath, path.dirname(absolutePath));
  return moduleObj.exports;
}

const zlib = require("node:zlib");

// ── Configuration: production fails closed ───────────────────────────────────
test("fieldOpsApiBaseUrl rejects localhost, private IPs and non-HTTPS URLs in production", () => {
  const config = loadTsModule("../lib/field-ops-config.ts");
  assert.equal(config.validateApiUrl("http://field-ops.camartes.com", true).valid, false);
  assert.equal(config.validateApiUrl("https://localhost:8000", true).valid, false);
  assert.equal(config.validateApiUrl("https://127.0.0.1:8000", true).valid, false);
  assert.equal(config.validateApiUrl("https://192.168.1.10:8000", true).valid, false);
  const ok = config.validateApiUrl("https://field-ops.camartes.com", true);
  assert.equal(ok.valid, true);
  assert.equal(ok.url, "https://field-ops.camartes.com");
  assert.equal(config.validateApiUrl("http://127.0.0.1:8000", false).valid, true);
  assert.throws(
    () => config.fieldOpsApiBaseUrl({ EXPO_PUBLIC_FIELD_OPS_API: "http://127.0.0.1:8000", isDev: false }),
    /Production configuration error/,
  );
  assert.equal(config.fieldOpsApiBaseUrl({ EXPO_PUBLIC_FIELD_OPS_API: "", isDev: false }), "");
});

test("no demo credentials ship in the app bundle sources", () => {
  const roots = ["../lib", "../app", "../components"];
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.resolve(__dirname, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = fs.readFileSync(path.resolve(__dirname, rel), "utf8");
        if (/field2026|DEMO_PASSWORDS|AKIA[0-9A-Z]{12}/.test(text)) offenders.push(rel);
      }
    }
  };
  roots.forEach(walk);
  assert.deepEqual(offenders, []);
});

test("haversineKm calculates distance between the two Hyderabad hubs", () => {
  const geo = loadTsModule("../lib/geo.ts");
  const d = geo.haversineKm({ lat: 17.4126, lng: 78.4483 }, { lat: 17.4483, lng: 78.3816 });
  assert.ok(d > 7.5 && d < 8.5, `got ${d}`);
  assert.equal(geo.formatKm(0.4), "400 m");
});

test("navigation uses the stop's real coordinates, falls back to its address, and works without GPS", () => {
  const geo = loadTsModule("../lib/geo.ts");
  const stop = { lat: 17.4486, lng: 78.3908, address: "Madhapur" };
  assert.equal(
    geo.navigationUrl({ lat: 17.4483, lng: 78.3816 }, stop),
    "https://www.google.com/maps/dir/?api=1&origin=17.4483,78.3816&destination=17.4486,78.3908&travelmode=driving",
  );
  assert.equal(geo.navigationUrl(null, stop), "https://www.google.com/maps/dir/?api=1&destination=17.4486,78.3908&travelmode=driving");
  assert.match(geo.navigationUrl(null, { lat: null, lng: null, address: "Road 12, Banjara Hills" }), /destination=Road%2012%2C%20Banjara%20Hills/);
  assert.equal(geo.navigationUrl(null, { lat: 0, lng: 0, address: "" }), null);
  assert.equal(geo.navigationUrl(null, null), null);
});

test("a GPS fix older than two minutes is stale", () => {
  const geo = loadTsModule("../lib/geo.ts");
  const now = Date.parse("2026-10-07T10:00:00Z");
  assert.equal(geo.isStaleFix({ at: "2026-10-07T09:59:00Z" }, now), false);
  assert.equal(geo.isStaleFix({ at: "2026-10-07T09:57:30Z" }, now), true);
  assert.equal(geo.isStaleFix(null, now), true);
});

// ── Offline queue ────────────────────────────────────────────────────────────
const Q = () => loadTsModule("../lib/sync-queue.ts");
const item = (q, n, over = {}) =>
  q.createItem(
    { label: n, entityKey: over.entityKey ?? "task:T1", path: `/api/field-ops/tasks/T1/${n}`, body: {}, idempotencyKey: over.key ?? `${n}:1` },
    over.at ?? 1000,
    `id-${n}`,
  );

test("queue: writing locally never marks an item SYNCED", () => {
  const q = Q();
  const { queue } = q.enqueue([], item(q, "check-in"));
  assert.equal(queue[0].status, "PENDING");
  assert.equal(q.summarize(queue).pending, 1);
  const syncing = q.markSyncing(queue, "id-check-in");
  assert.equal(syncing[0].status, "SYNCING");
  const done = q.applyResult(syncing, "id-check-in", { ok: true, serverId: "LV-123" }, 2000);
  assert.equal(done[0].status, "SYNCED");
  assert.equal(done[0].syncedAt, 2000);
  assert.equal(done[0].serverId, "LV-123"); // the screen reports the server's own record id
});

test("queue: duplicate idempotency keys are refused", () => {
  const q = Q();
  let { queue } = q.enqueue([], item(q, "complete"));
  const again = q.enqueue(queue, item(q, "complete"));
  assert.equal(again.accepted, false);
  assert.equal(again.reason, "DUPLICATE");
  assert.equal(again.queue.length, 1);
});

test("queue: retryable failures back off exponentially, business rejections fail", () => {
  const q = Q();
  const fixed = () => 0.5; // no jitter
  let { queue } = q.enqueue([], item(q, "photos"));
  queue = q.applyResult(queue, "id-photos", { ok: false, retryable: true, code: "NETWORK", message: "x" }, 10_000, fixed);
  assert.equal(queue[0].status, "RETRYING");
  assert.equal(queue[0].nextAttemptAt, 10_000 + 2_000);
  queue = q.applyResult(queue, "id-photos", { ok: false, retryable: true, code: "NETWORK", message: "x" }, 20_000, fixed);
  assert.equal(queue[0].nextAttemptAt, 20_000 + 4_000);
  assert.equal(q.backoffMs(30, fixed), q.MAX_BACKOFF_MS);
  queue = q.applyResult(queue, "id-photos", { ok: false, retryable: false, code: "OUTSIDE_CHECK_IN_RADIUS", message: "far" }, 30_000, fixed);
  assert.equal(queue[0].status, "FAILED");
  assert.equal(queue[0].lastCode, "OUTSIDE_CHECK_IN_RADIUS");
});

test("queue: steps for one task are sent in order and a failure blocks later steps", () => {
  const q = Q();
  let queue = [];
  for (const [n, at] of [["check-in", 1], ["start", 2], ["complete", 3]]) queue = q.enqueue(queue, item(q, n, { at })).queue;
  queue = q.enqueue(queue, item(q, "visit", { at: 4, entityKey: "onboard:x" })).queue;
  assert.equal(q.nextEligible(queue, 10).id, "id-check-in");
  queue = q.applyResult(queue, "id-check-in", { ok: false, retryable: false, code: "OUTSIDE_CHECK_IN_RADIUS", message: "" }, 10);
  // The failed check-in blocks "start"/"complete", but other entities still sync.
  assert.equal(q.nextEligible(queue, 10).id, "id-visit");
  queue = q.discard(queue, "id-check-in");
  assert.equal(q.nextEligible(queue, 10).id, "id-start");
});

test("queue: an app kill mid-sync is recovered and retried with the same key", () => {
  const q = Q();
  let { queue } = q.enqueue([], item(q, "complete"));
  queue = q.markSyncing(queue, "id-complete");
  const recovered = q.recoverOnStart(queue, 5000);
  assert.equal(recovered[0].status, "RETRYING");
  assert.equal(recovered[0].idempotencyKey, "complete:1");
  assert.equal(q.nextEligible(recovered, 5000).id, "id-complete");
});

test("queue: bounded — synced rows are pruned, unsynced work is never dropped", () => {
  const q = Q();
  let queue = [];
  for (let i = 0; i < 120; i++) {
    queue = q.enqueue(queue, item(q, `s${i}`, { entityKey: `e${i}`, key: `k${i}` })).queue;
    queue = q.applyResult(queue, `id-s${i}`, { ok: true }, i);
  }
  queue = q.prune(queue);
  assert.equal(queue.length, q.KEEP_SYNCED);
  let full = [];
  for (let i = 0; i < q.MAX_ITEMS; i++) full.push(q.createItem({ label: "p", entityKey: `p${i}`, path: "/x", body: {}, idempotencyKey: `p${i}` }, i, `p${i}`));
  const refused = q.enqueue(full, q.createItem({ label: "x", entityKey: "x", path: "/x", body: {}, idempotencyKey: "x" }, 1, "x"));
  assert.equal(refused.accepted, false);
  assert.equal(refused.reason, "QUEUE_FULL");
});

test("queue: sign-out keeps only unsynced work; another employee never inherits local work", () => {
  const q = Q();
  let queue = [];
  for (const n of ["en-route", "check-in", "complete"]) queue = q.enqueue(queue, item(q, n)).queue;
  queue = q.applyResult(queue, "id-en-route", { ok: true }, 10);
  queue = q.applyResult(queue, "id-check-in", { ok: false, retryable: false, code: "OUTSIDE_CHECK_IN_RADIUS", message: "" }, 11);
  assert.deepEqual(q.retainOnSignOut(queue).map((x) => x.id), ["id-check-in", "id-complete"]);
  assert.equal(q.retainOnSignOut(q.applyResult(queue, "id-complete", { ok: true }, 12).filter((x) => x.status === "SYNCED")).length, 0);
  assert.equal(q.belongsToOtherEmployee("pr-a", "pr-b"), true);
  assert.equal(q.belongsToOtherEmployee("pr-a", "pr-a"), false);
  assert.equal(q.belongsToOtherEmployee(null, "pr-a"), false);
});

test("queue: uploaded media ids are placed in the request body", () => {
  const q = Q();
  const body = q.withMediaIds({ checkpoint: "x" }, [
    { ref: "a", field: "mediaId", contentType: "image/jpeg", idempotencyKey: "m1" },
    { ref: "b", field: "photoMediaIds", array: true, contentType: "image/jpeg", idempotencyKey: "m2" },
    { ref: "c", field: "photoMediaIds", array: true, contentType: "image/jpeg", idempotencyKey: "m3" },
  ], ["med-1", "med-2", "med-3"]);
  assert.deepEqual(body, { checkpoint: "x", mediaId: "med-1", photoMediaIds: ["med-2", "med-3"] });
});

// ── SLA display uses the server clock ────────────────────────────────────────
test("slaView ticks against the server clock and never shows a better state than the server", () => {
  const f = loadTsModule("../lib/field-ops.ts");
  const deviceNow = Date.parse("2026-09-25T06:00:00Z");
  // Device clock is 2 hours behind the server.
  const offset = f.clockOffsetMs("2026-09-25T08:00:00Z", deviceNow);
  assert.equal(offset, 2 * 3600 * 1000);
  const sla = { status: "ON_TRACK", dueAt: "2026-09-25T07:30:00Z", remainingSeconds: 5400, startAt: null, breachedAt: null, lateReason: null };
  const view = f.slaView(sla, offset, 45, deviceNow);
  assert.equal(view.status, "BREACHED", "a wrong phone clock must not hide a breach");
  assert.equal(view.tone, "red");
  const serverSaysRisk = { ...sla, status: "AT_RISK", dueAt: "2026-09-25T12:00:00Z" };
  assert.equal(f.slaView(serverSaysRisk, 0, 45, deviceNow).status, "AT_RISK");
  assert.equal(f.slaView({ ...sla, status: null, dueAt: null }, 0, 45, deviceNow).status, null);
  assert.equal(f.formatCountdown(-3900), "-1h 5m");
  assert.equal(f.formatCountdown(1200), "20m");
});

// ── Next step & offline projection ───────────────────────────────────────────
function detail(over = {}) {
  return {
    id: "T1", taskCode: "T1", title: "t", kind: "delivery", notes: "", customerName: "c", customerPhone: null, area: null,
    priority: "normal", status: "assigned", state: "ASSIGNED", attemptNo: 1, assigneeId: "fe", hubId: null,
    stop: { type: "CUSTOMER", name: "s", address: null, lat: 17.44, lng: 78.35 },
    sla: { status: "ON_TRACK", remainingSeconds: 1, dueAt: null, startAt: null, breachedAt: null, lateReason: null },
    startedAt: null, checkedInAt: null, completedAt: null, createdAt: null, updatedAt: null,
    items: [{ itemId: "i1", sku: "CAM", name: "Cam", serial: "SN••••", condition: "GOOD", locationType: "EMPLOYEE", serialVerified: false }],
    evidence: { checkIn: null, rejectedCheckIns: [], photos: [], kitConditions: [], pin: null, pinRequired: true, podRequired: true, pod: null, failures: [] },
    timeline: [], serverTime: "2026-09-25T06:00:00Z",
    ...over,
  };
}

test("nextStep follows the delivery lifecycle and never skips evidence", () => {
  const f = loadTsModule("../lib/field-ops.ts");
  const t = detail();
  assert.equal(f.nextStep(t, t.evidence), "START_ROUTE");
  assert.equal(f.nextStep({ ...t, state: "EN_ROUTE" }, t.evidence), "ARRIVE");
  assert.equal(f.nextStep({ ...t, state: "ARRIVED" }, t.evidence), "CHECK_IN");
  assert.equal(f.nextStep({ ...t, state: "CHECKED_IN" }, t.evidence), "START_WORK");
  const working = { ...t, state: "IN_PROGRESS" };
  assert.equal(f.nextStep(working, t.evidence), "SERIALS");
  const verified = { ...working, items: [{ ...t.items[0], serialVerified: true }] };
  assert.equal(f.nextStep(verified, t.evidence), "KIT");
  const ev = { ...t.evidence, kitConditions: [{ itemId: "i1", grade: "GOOD", phase: "DELIVERY", notes: null, at: "" }] };
  assert.equal(f.nextStep(verified, ev), "PHOTO");
  const ev2 = { ...ev, photos: [{ id: "p", mediaId: "m", url: "u", checkpoint: "c", lat: 0, lng: 0, accuracyM: 5, attemptNo: 1, at: "" }] };
  assert.equal(f.nextStep(verified, ev2), "PIN");
  const ev3 = { ...ev2, pin: { state: "VERIFIED", expiresAt: "", attemptsLeft: 5 } };
  assert.equal(f.nextStep(verified, ev3), "POD");
  assert.equal(f.nextStep(verified, { ...ev3, pod: { recipientName: "r", signatureUrl: null, at: "", lat: 0, lng: 0 } }), "COMPLETE");
  assert.equal(f.nextStep({ ...t, state: "FAILED_ATTEMPT" }, t.evidence), "RETRY");
  // Photos from a previous attempt do not count after a retry.
  assert.equal(f.nextStep({ ...verified, attemptNo: 2 }, { ...ev2, pin: null, pinRequired: false, podRequired: false }), "PHOTO");
});

test("projectTask lets offline work continue but marks every projected step as pending", () => {
  const f = loadTsModule("../lib/field-ops.ts");
  const t = { ...detail(), kind: "pickup", evidence: { ...detail().evidence, pinRequired: false, podRequired: false } };
  const pending = [
    { path: "/api/field-ops/tasks/T1/en-route", body: {}, status: "PENDING" },
    { path: "/api/field-ops/tasks/T1/check-in", body: {}, status: "PENDING" },
    { path: "/api/field-ops/tasks/T1/start", body: {}, status: "RETRYING" },
    { path: "/api/field-ops/tasks/T1/verify-serial", body: { itemId: "i1" }, status: "PENDING" },
    { path: "/api/field-ops/tasks/T1/kit-condition", body: { itemId: "i1", grade: "GOOD" }, status: "PENDING" },
  ];
  const { task, pendingSteps } = f.projectTask(t, pending);
  assert.equal(task.state, "IN_PROGRESS");
  assert.equal(f.nextStep(task, task.evidence), "PHOTO");
  assert.ok(pendingSteps.has("check-in") && pendingSteps.has("kit-condition"));
  assert.equal(t.state, "ASSIGNED", "server copy is not mutated");
  // Rejected (FAILED) actions are not projected.
  const rejected = f.projectTask(t, [{ path: "/api/field-ops/tasks/T1/check-in", body: {}, status: "FAILED" }]);
  assert.equal(rejected.task.state, "ASSIGNED");
});

test("SOS offline fallback picks the nearest manager by GPS, else the home hub", () => {
  const f = loadTsModule("../lib/field-ops.ts");
  const managers = [
    { id: "bh", name: "Banjara", phone: "1", city: "Hyderabad", hubId: "hub-bh", hubName: "BH", lat: 17.4126, lng: 78.4483 },
    { id: "hc", name: "HITEC", phone: "2", city: "Hyderabad", hubId: "hub-hc", hubName: "HC", lat: 17.4483, lng: 78.3816 },
  ];
  assert.equal(f.nearestManager({ lat: 17.446, lng: 78.38 }, managers, "hub-bh").id, "hc");
  assert.equal(f.nearestManager(null, managers, "hub-hc").id, "hc");
  assert.equal(f.nearestManager(null, managers, "unknown").id, "bh");
  assert.equal(f.nearestManager(null, [], "hub-bh"), null);
});

test("orderTasks puts active work first, then by server SLA deadline", () => {
  const f = loadTsModule("../lib/field-ops.ts");
  const mk = (id, state, due) => ({ ...detail(), id, state, sla: { ...detail().sla, dueAt: due } });
  const ordered = f.orderTasks([
    mk("late", "ASSIGNED", "2026-09-25T15:00:00Z"),
    mk("done", "COMPLETED", "2026-09-25T05:00:00Z"),
    mk("early", "ASSIGNED", "2026-09-25T10:45:00Z"),
    mk("active", "IN_PROGRESS", "2026-09-25T18:00:00Z"),
  ]);
  assert.deepEqual(ordered.map((t) => t.id), ["active", "early", "late", "done"]);
});

// ── Signature → PNG (server refuses SVG) ─────────────────────────────────────
test("signature strokes rasterise to a valid PNG", () => {
  const s = loadTsModule("../lib/signature-png.ts");
  assert.equal(s.signatureDataUri([[{ x: 1, y: 1 }]], 300, 150), null, "an empty pad is not a signature");
  const strokes = [[{ x: 20, y: 80 }, { x: 80, y: 40 }, { x: 140, y: 100 }, { x: 200, y: 60 }, { x: 260, y: 90 }]];
  const uri = s.signatureDataUri(strokes, 300, 150);
  assert.ok(uri.startsWith("data:image/png;base64,"));
  const bytes = Buffer.from(uri.split(",")[1], "base64");
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const idatLen = bytes.readUInt32BE(33);
  assert.equal(bytes.toString("ascii", 37, 41), "IDAT");
  const raw = zlib.inflateSync(bytes.subarray(41, 41 + idatLen));
  assert.equal(raw.length, (480 + 1) * 180);
  assert.ok(raw.some((b, i) => i % 481 !== 0 && b < 128), "ink pixels present");
  // Our base64 encoder matches Node's.
  const sample = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
  assert.equal(s.toBase64(sample), Buffer.from(sample).toString("base64"));
});

// ── API error handling ───────────────────────────────────────────────────────
test("API errors keep the server code and classify retryability", () => {
  const api = loadTsModule("../lib/ops-api.ts");
  const e = api.parseError(422, { detail: { code: "OUTSIDE_CHECK_IN_RADIUS", message: "You are 180 m", distanceM: 180 } });
  assert.equal(e.code, "OUTSIDE_CHECK_IN_RADIUS");
  assert.equal(e.retryable, false);
  assert.equal(e.detail.distanceM, 180);
  assert.equal(api.parseError(403, { detail: "Use the task action endpoints" }).message, "Use the task action endpoints");
  assert.equal(api.parseError(503, null).retryable, true);
  assert.equal(api.parseError(429, null).retryable, true);
  assert.equal(api.isRetryableStatus(0), true);
  assert.equal(api.isRetryableStatus(409), false);
});

// ── i18n ─────────────────────────────────────────────────────────────────────
test("Hindi and Telugu cover every UI string and translate server errors", () => {
  const i18n = loadTsModule("../lib/i18n.ts");
  assert.deepEqual(i18n.missingKeys("hi"), []);
  assert.deepEqual(i18n.missingKeys("te"), []);
  assert.equal(i18n.t("en", "syncPending", { n: 3 }), "3 waiting to sync");
  assert.notEqual(i18n.errorText("te", "SERIAL_MISMATCH", "x"), "x");
  assert.equal(i18n.errorText("hi", "SOMETHING_NEW", "server text"), "server text");
});

// ── Navigation contract (Jobs / job screen) ──────────────────────────────────
function routerRecorder({ canGoBack = true } = {}) {
  const calls = [];
  const rec = (name) => (...args) => { calls.push([name, ...args]); };
  globalThis.__routerMock = {
    navigate: rec("navigate"), push: rec("push"), replace: rec("replace"), back: rec("back"),
    dismissTo: rec("dismissTo"), canGoBack: () => canGoBack,
  };
  return calls;
}

test("navigation: opening a job from another tab is exactly one navigate into the existing Jobs stack", () => {
  const calls = routerRecorder();
  const nav = loadTsModule("../lib/nav.ts");
  nav.openTask("TSK-TEST-PICKUP");
  assert.deepEqual(calls, [["navigate", "/(app)/tasks/TSK-TEST-PICKUP"]]);
});

test("navigation: from Alerts the root-level screen is closed first, so no second tab navigator is pushed", () => {
  let calls = routerRecorder({ canGoBack: true });
  loadTsModule("../lib/nav.ts").openTaskFromRootScreen("TSK-1");
  assert.deepEqual(calls, [["back"], ["navigate", "/(app)/tasks/TSK-1"]]);
  calls = routerRecorder({ canGoBack: false }); // opened directly by URL: nothing to close
  loadTsModule("../lib/nav.ts").openTaskFromRootScreen("TSK-1");
  assert.deepEqual(calls, [["navigate", "/(app)/tasks/TSK-1"]]);
});

test("navigation: Back to jobs pops to the list once (never a replace that keeps the job's params)", () => {
  const calls = routerRecorder();
  loadTsModule("../lib/nav.ts").backToJobs();
  assert.deepEqual(calls, [["dismissTo", "/(app)/tasks"]]);
});

test("navigation: route and screen contract holds in the source", () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
  // One sign-in route (/login); "/" is only the Home tab, so redirects can never resolve to themselves.
  assert.ok(fs.existsSync(path.resolve(__dirname, "../app/login.tsx")));
  assert.ok(!fs.existsSync(path.resolve(__dirname, "../app/index.tsx")));
  // The Jobs stack keeps its list as the first screen, and a job alone in the stack still offers Jobs.
  const jobsLayout = read("app/(app)/tasks/_layout.tsx");
  assert.match(jobsLayout, /initialRouteName:\s*"index"/);
  assert.match(jobsLayout, /backToJobs/);
  // Outside the Jobs stack, jobs are opened only through lib/nav (no ad-hoc push/replace into tasks/[id]).
  for (const rel of ["app/(app)/index.tsx", "app/(app)/roster.tsx", "app/alerts.tsx"]) {
    assert.doesNotMatch(read(rel), /router\.(push|replace|navigate)\(`\/\(app\)\/tasks\/\$\{/, rel);
  }
  // No screen navigates from inside an effect (that is what looped on sign-out before).
  const screens = ["app/login.tsx", "app/(app)/_layout.tsx", "app/admin.tsx", "app/(app)/tasks/[id].tsx", "app/(app)/tasks/index.tsx",
                   "app/(app)/index.tsx", "app/(app)/roster.tsx", "app/(app)/profile.tsx", "app/alerts.tsx", "app/expenses.tsx"];
  for (const rel of screens) {
    const src = read(rel);
    const effects = src.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[/g) || [];
    for (const body of effects) assert.doesNotMatch(body, /router\.|<Redirect/, `${rel}: navigation inside useEffect`);
  }
});

test("queue: retrying a location-rejected step sends the current fix with a new key; other retries keep theirs", () => {
  const q = Q();
  let queue = q.enqueue([], q.createItem({ label: "GPS check-in", entityKey: "task:T1", path: "/api/field-ops/tasks/T1/check-in",
    body: { lat: 17.4486, lng: 78.3908, accuracyM: 10 }, idempotencyKey: "check-in:T1:a1:x" }, 1000, "id-ci")).queue;
  queue = q.applyResult(queue, "id-ci", { ok: false, retryable: false, code: "OUTSIDE_CHECK_IN_RADIUS", message: "too far" }, 1100);
  const fix = { lat: 17.4484, lng: 78.3817, accuracyM: 12, mocked: false, capturedAt: "2026-10-07T16:00:00Z" };
  const retried = q.retryWithFreshFix(queue, "id-ci", 2000, fix, "retry:new");
  assert.equal(retried[0].status, "PENDING");
  assert.equal(retried[0].body.lat, 17.4484);
  assert.equal(retried[0].idempotencyKey, "retry:new"); // body changed, so the old key is never reused
  // A non-location rejection is retried as it was (same body, same key).
  let other = q.enqueue([], q.createItem({ label: "Serial", entityKey: "task:T1", path: "/x/verify-serial", body: { last4: "1234" }, idempotencyKey: "k1" }, 1, "id-s")).queue;
  other = q.applyResult(other, "id-s", { ok: false, retryable: false, code: "SERIAL_MISMATCH", message: "" }, 2);
  const again = q.retryWithFreshFix(other, "id-s", 3, fix, "retry:new");
  assert.equal(again[0].idempotencyKey, "k1");
  assert.deepEqual(again[0].body, { last4: "1234" });
});

test("screens: lists reload on focus, and a duplicate tap is silent rather than a fake server rejection", () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
  for (const rel of ["app/(app)/onboard/index.tsx", "app/(app)/tasks/index.tsx", "app/(app)/profile.tsx"]) {
    assert.match(read(rel), /useFocusEffect\(/, rel);
  }
  const job = read("app/(app)/tasks/[id].tsx");
  assert.match(job, /r\.code === "ALREADY_QUEUED"\) return;/);
  assert.doesNotMatch(job, /showDialog\(tr\("rejected"\)/);
});

test("geography: villages are only fetched under a parent, lists are paged, nothing national is cached", () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
  const lib = read("lib/geography.ts");
  const picker = read("components/location-picker.tsx");
  for (const m of lib.matchAll(/\$\{GEO\}\/villages\?([^`]*)`/g)) assert.match(m[1], /subdistrict_id=/);
  for (const m of lib.matchAll(/limit=(\d+)/g)) assert.ok(Number(m[1]) <= 100, `page size ${m[1]}`);
  assert.doesNotMatch(picker, /\/villages/); // the picker only browses through childrenPath()
  assert.match(picker, /search\?query=\$\{encodeURIComponent\(q\)\}&limit=20/);
  assert.match(picker, /setTimeout\(async \(\) =>[\s\S]*?, 300\)/); // debounced
  assert.match(lib, /MAX_LISTS = \d+/);
  assert.match(lib, /geo:v1:\$\{owner\}/); // cache is per employee
});

test("visits: the area is optional and only sent when chosen (the server validates it)", () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
  const ctx = read("lib/app-context.tsx");
  assert.match(ctx, /\.\.\.\(input\.geoUnitId \? \{ geoUnitId: input\.geoUnitId \} : \{\}\)/);
  const form = read("app/(app)/onboard/new.tsx");
  assert.match(form, /geoUnitId: area\?\.id \?\? null/);
  assert.doesNotMatch(form, /problems\.push\("err_[A-Z_]*AREA/); // never blocks saving a visit
});

test("geography picker: a place is only returned after Confirm; own area and nearby are cached per employee", () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
  const picker = read("components/location-picker.tsx");
  const choose = picker.match(/function choose\(unit: GeoUnit\) \{([\s\S]*?)\r?\n  \}/)[1];
  assert.doesNotMatch(choose, /onSelect|onClose/); // picking only stages the place
  const confirm = picker.match(/function confirm\(\) \{([\s\S]*?)\r?\n  \}/)[1];
  assert.match(confirm, /onSelect\(pending\)/);
  assert.match(picker, /cachedValue<MyArea>\(owner, app\.get, `\$\{GEO\}\/me`, "me"\)/);
  assert.match(picker, /"nearby",\r?\n/);
  const lib = read("lib/geography.ts");
  assert.match(lib, /key\(owner, "me"\), key\(owner, "nearby"\)/); // cleared with the rest of the employee's cache
});
