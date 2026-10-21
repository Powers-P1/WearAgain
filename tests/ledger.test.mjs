import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Ledger, LedgerError } from "../worker/src/ledger.js";
import { createSqlStorage } from "./helpers/sql-storage.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const HASH = "a".repeat(64);
const LIMITS = { totalUnits: 1000, dailyUnits: 60, sessionDailyUnits: 12 };

function setup(t, limits = LIMITS) {
  const storage = createSqlStorage();
  t.after(() => storage.close());
  return { storage, ledger: new Ledger(storage, limits) };
}

function reserve(ledger, renderKey = "render-1", sessionId = "session-1", now = NOW, requestHash = HASH) {
  return ledger.reserve({ sessionId, renderKey, requestHash, now });
}

function submitted(ledger, renderKey = "render-1", sessionId = "session-1", now = NOW) {
  reserve(ledger, renderKey, sessionId, now);
  ledger.markSubmitting(sessionId, renderKey, now);
  return ledger.attachTask(sessionId, renderKey, `task-${sessionId}-${renderKey}`, now);
}

function throwsCode(callback, code) {
  assert.throws(callback, (error) => error instanceof LedgerError && error.code === code);
}

test("two-unit reservation is atomic and same render replay never reserves or submits twice", (t) => {
  const { ledger } = setup(t);
  const first = reserve(ledger);
  assert.equal(first.created, true);
  assert.equal(first.record.status, "reserved");
  assert.equal(first.record.units, 2);
  assert.deepEqual(reserve(ledger), { created: false, record: first.record });
  assert.equal(ledger.summary("session-1", NOW).total.reservedUnits, 2);
  ledger.markSubmitting("session-1", "render-1", NOW);
  throwsCode(() => ledger.markSubmitting("session-1", "render-1", NOW), "invalid_state");
  throwsCode(() => reserve(ledger, "render-1", "session-1", NOW, "b".repeat(64)), "conflict");
  assert.equal(ledger.summary("session-1", NOW).total.reservedUnits, 2);
});

test("global, daily and session daily caps each reject before a new row is written", (t) => {
  for (const [scope, limits] of [
    ["total", { totalUnits: 2, dailyUnits: 20, sessionDailyUnits: 20 }],
    ["daily", { totalUnits: 20, dailyUnits: 2, sessionDailyUnits: 20 }],
    ["sessionDaily", { totalUnits: 20, dailyUnits: 20, sessionDailyUnits: 2 }],
  ]) {
    const { ledger } = setup(t, limits);
    reserve(ledger);
    assert.throws(() => reserve(ledger, "render-2"), (error) => error.code === "limit_exceeded" && error.details.scope === scope);
    assert.equal(ledger.get("session-1", "render-2"), null);
    assert.equal(ledger.summary("session-1", NOW)[scope].remainingUnits, 0);
  }
});

test("concurrent callers with distinct sessions cannot overdraw the global budget", async (t) => {
  const { ledger } = setup(t, { totalUnits: 6, dailyUnits: 6, sessionDailyUnits: 6 });
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, n) =>
    Promise.resolve().then(() => reserve(ledger, `render-${n}`, `session-${n}`))));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 3);
  assert.equal(ledger.summary("session-1", NOW).total.reservedUnits, 6);
  const replay = await Promise.all(Array.from({ length: 20 }, () =>
    Promise.resolve().then(() => reserve(ledger, "render-0", "session-0"))));
  assert.equal(replay.some((result) => result.created), false);
  assert.equal(ledger.summary("session-1", NOW).total.reservedUnits, 6);
});

test("a timeout retains its hold and can never trigger another task creation", (t) => {
  const { ledger } = setup(t);
  reserve(ledger);
  ledger.markSubmitting("session-1", "render-1", NOW);
  ledger.markPending("session-1", "render-1", "request_timeout", NOW + 1000);
  assert.equal(reserve(ledger, "render-1", "session-1", NOW + 2000).created, false);
  throwsCode(() => ledger.markSubmitting("session-1", "render-1", NOW + 2000), "invalid_state");
  assert.equal(ledger.get("session-1", "render-1").taskId, null);
  assert.equal(ledger.summary("session-1", NOW + 2000).total.reservedUnits, 2);
  assert.deepEqual(ledger.dueTasks(NOW + 2000), []);
});

test("an interrupted upload cannot silently release or reuse its reservation", (t) => {
  const { ledger } = setup(t);
  reserve(ledger);
  const pending = ledger.markPending("session-1", "render-1", "upload_timeout", NOW + 1000);
  assert.equal(pending.status, "pending");
  assert.equal(pending.submittedAt, null);
  assert.equal(pending.taskId, null);
  throwsCode(() => ledger.markSubmitting("session-1", "render-1", NOW + 2000), "invalid_state");
  throwsCode(() => ledger.settleFreeError("session-1", "render-1", {
    kind: "create_validation", errorCode: "InvalidParameters", httpStatus: 400,
  }, NOW + 2000), "invalid_state");
  assert.equal(ledger.summary("session-1", NOW + 2000).total.reservedUnits, 2);
});

test("success settles exactly once before any image download and cannot be refunded", (t) => {
  const { ledger } = setup(t);
  const attached = submitted(ledger);
  const first = ledger.settleSuccess("session-1", "render-1", NOW + 1);
  assert.equal(first.status, "succeeded");
  assert.deepEqual(ledger.settleSuccess("session-1", "render-1", NOW + 2), first);
  const usage = ledger.summary("session-1", NOW + 2);
  assert.equal(usage.total.spentUnits, 2);
  assert.equal(usage.total.reservedUnits, 0);
  assert.equal(usage.daily.spentUnits, 2);
  assert.equal(ledger.markPending("session-1", "render-1", "download_timeout", NOW + 2).status, "succeeded");
  throwsCode(() => ledger.settleFreeError("session-1", "render-1", {
    kind: "task_error", taskId: attached.taskId, errorCode: "error_decode_image",
  }, NOW + 2), "invalid_state");
  assert.deepEqual(ledger.dueTasks(NOW + 10_000), []);
});

test("only fixture-confirmed terminal errors release a matching task reservation", (t) => {
  const { ledger } = setup(t);
  const attached = submitted(ledger);
  for (const evidence of [
    { kind: "timeout", errorCode: "error_decode_image" },
    { kind: "task_error", taskId: attached.taskId, errorCode: "unknown_error" },
    { kind: "task_error", taskId: attached.taskId, errorCode: "error_decode_image", charged: false },
    { kind: "create_validation", errorCode: "InvalidParameters", httpStatus: 500 },
    null,
  ]) {
    throwsCode(() => ledger.settleFreeError("session-1", "render-1", evidence, NOW), "invalid_input");
  }
  throwsCode(() => ledger.settleFreeError("session-1", "render-1", {
    kind: "task_error", taskId: "different-task", errorCode: "error_decode_image",
  }, NOW), "invalid_state");
  assert.equal(ledger.summary("session-1", NOW).total.reservedUnits, 2);
  const evidence = { kind: "task_error", taskId: attached.taskId, errorCode: "error_decode_image" };
  const terminal = ledger.settleFreeError("session-1", "render-1", evidence, NOW + 1);
  assert.equal(terminal.status, "failed_free");
  assert.deepEqual(ledger.settleFreeError("session-1", "render-1", evidence, NOW + 2), terminal);
  assert.equal(ledger.summary("session-1", NOW + 2).total.reservedUnits, 0);
  assert.equal(ledger.summary("session-1", NOW + 2).total.spentUnits, 0);
  throwsCode(() => ledger.settleSuccess("session-1", "render-1", NOW + 2), "invalid_state");
  assert.equal(reserve(ledger, "render-1", "session-1", NOW + 2).created, false);
});

test("create InvalidParameters can release only after submission and before task attachment", (t) => {
  const { ledger } = setup(t);
  const evidence = { kind: "create_validation", errorCode: "InvalidParameters", httpStatus: 400 };
  reserve(ledger);
  throwsCode(() => ledger.settleFreeError("session-1", "render-1", evidence, NOW), "invalid_state");
  ledger.markSubmitting("session-1", "render-1", NOW);
  assert.equal(ledger.settleFreeError("session-1", "render-1", evidence, NOW).status, "failed_free");
  submitted(ledger, "render-2");
  throwsCode(() => ledger.settleFreeError("session-1", "render-2", evidence, NOW), "invalid_state");
  assert.equal(ledger.summary("session-1", NOW).total.reservedUnits, 2);
});

test("provider task IDs cannot be reassigned between renders and attachment is replay-safe", (t) => {
  const { ledger } = setup(t);
  const first = submitted(ledger);
  assert.deepEqual(ledger.attachTask("session-1", "render-1", first.taskId, NOW), first);
  throwsCode(() => ledger.attachTask("session-1", "render-1", "task-replaced", NOW), "invalid_state");
  reserve(ledger, "render-2");
  ledger.markSubmitting("session-1", "render-2", NOW);
  throwsCode(() => ledger.attachTask("session-1", "render-2", first.taskId, NOW), "conflict");
  assert.equal(ledger.get("session-1", "render-2").taskId, null);
});

test("provider task ID boundaries match the YouCam parser", (t) => {
  const { ledger } = setup(t);
  reserve(ledger);
  ledger.markSubmitting("session-1", "render-1", NOW);
  for (const bad of ["", "x".repeat(1025), "task.with.dots", "task/with/slashes", "task:colon"]) {
    throwsCode(() => ledger.attachTask("session-1", "render-1", bad, NOW), "invalid_input");
  }
  const taskId = "x".repeat(1024);
  assert.equal(ledger.attachTask("session-1", "render-1", taskId, NOW).taskId, taskId);
  assert.equal(ledger.settleFreeError("session-1", "render-1", {
    kind: "task_error", taskId, errorCode: "error_decode_image",
  }, NOW).status, "failed_free");
});

test("pending holds survive midnight, including sessions that change their render key", (t) => {
  const { ledger } = setup(t, { totalUnits: 100, dailyUnits: 2, sessionDailyUnits: 2 });
  const before = Date.parse("2026-10-21T23:59:59Z");
  const after = before + 2000;
  submitted(ledger, "render-1", "session-1", before);
  const usage = ledger.summary("session-1", after);
  assert.equal(usage.utcDay, "2026-10-22");
  assert.equal(usage.daily.reservedUnits, 2);
  assert.equal(usage.sessionDaily.reservedUnits, 2);
  throwsCode(() => reserve(ledger, "render-2", "session-1", after), "limit_exceeded");
  throwsCode(() => reserve(ledger, "render-2", "session-2", after), "limit_exceeded");
  ledger.settleSuccess("session-1", "render-1", after);
  assert.equal(ledger.summary("session-1", after).daily.spentUnits, 2);
  assert.equal(ledger.summary("session-1", after).daily.reservedUnits, 0);
  throwsCode(() => reserve(ledger, "render-2", "session-1", after), "limit_exceeded");
  reserve(ledger, "render-2", "session-1", after + 86_400_000);
  assert.equal(ledger.summary("session-1", after + 86_400_000).total.spentUnits, 2);
});

test("session budgets are separate while the daily key budget remains shared", (t) => {
  const { ledger } = setup(t, { totalUnits: 100, dailyUnits: 4, sessionDailyUnits: 2 });
  reserve(ledger);
  throwsCode(() => reserve(ledger, "render-2"), "limit_exceeded");
  reserve(ledger, "render-1", "session-2");
  throwsCode(() => reserve(ledger, "render-1", "session-3"), "limit_exceeded");
  assert.equal(ledger.summary("session-2", NOW).sessionDaily.reservedUnits, 2);
  assert.equal(ledger.summary("session-3", NOW).sessionDaily.reservedUnits, 0);
});

test("restarting a real SQLite-backed store preserves task ownership and outstanding reservations", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "wearagain-ledger-"));
  let openStore;
  // A single hook makes the close-before-delete order explicit on Windows.
  // Keep the current connection here even if a later assertion throws.
  t.after(() => {
    openStore?.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const filename = join(directory, "ledger.sqlite");
  const firstStore = openStore = createSqlStorage(filename);
  const first = new Ledger(firstStore, LIMITS);
  const attached = submitted(first);
  first.markPending("session-1", "render-1", "poll_timeout", NOW + 1000);
  first.claimRequestSlot(NOW);
  firstStore.close();
  openStore = undefined;
  const secondStore = openStore = createSqlStorage(filename);
  const second = new Ledger(secondStore, LIMITS);
  assert.equal(second.get("session-1", "render-1").taskId, attached.taskId);
  assert.equal(second.get("session-1", "render-1").reason, "poll_timeout");
  assert.equal(second.summary("session-1", NOW + 1000).total.reservedUnits, 2);
  assert.equal(reserve(second, "render-1", "session-1", NOW + 1000).created, false);
  throwsCode(() => second.markSubmitting("session-1", "render-1", NOW + 1000), "invalid_state");
  assert.equal(secondStore.sql.exec("SELECT COUNT(*) AS n FROM provider_requests").one().n, 1);
});

test("poll schedule is deterministic, bounded and stops after retention without releasing units", (t) => {
  const { ledger } = setup(t);
  submitted(ledger, "render-b");
  submitted(ledger, "render-a");
  ledger.setNextPoll("session-1", "render-a", NOW + 5000, NOW);
  assert.deepEqual(ledger.dueTasks(NOW).map((value) => value.renderKey), ["render-b"]);
  assert.deepEqual(ledger.dueTasks(NOW + 5000).map((value) => value.renderKey), ["render-b", "render-a"]);
  assert.equal(ledger.dueTasks(NOW + 5000, 1).length, 1);
  ledger.setNextPoll("session-1", "render-a", null, NOW);
  assert.deepEqual(ledger.dueTasks(NOW + 5000).map((value) => value.renderKey), ["render-b"]);
  ledger.stopPolling("session-1", "render-b", "retention_expired", NOW + 86_400_000);
  const record = ledger.get("session-1", "render-b");
  assert.equal(record.status, "pending");
  assert.equal(record.nextPollAt, null);
  assert.equal(ledger.summary("session-1", NOW + 86_400_000).total.reservedUnits, 4);
  assert.equal(ledger.dueTasks(NOW + 86_400_000).some((value) => value.renderKey === "render-b"), false);
  throwsCode(() => ledger.setNextPoll("session-1", "render-a", NOW - 1, NOW), "invalid_input");
  throwsCode(() => ledger.dueTasks(NOW, 101), "invalid_input");
});

test("the global request gate enforces rolling 5 QPS and is durable across instances", (t) => {
  const { storage, ledger } = setup(t);
  for (let n = 0; n < 5; n++) assert.deepEqual(ledger.claimRequestSlot(NOW), { allowed: true, retryAfterMs: 0 });
  assert.deepEqual(ledger.claimRequestSlot(NOW), { allowed: false, retryAfterMs: 1000 });
  assert.deepEqual(new Ledger(storage, LIMITS).claimRequestSlot(NOW + 999), { allowed: false, retryAfterMs: 1 });
  assert.deepEqual(ledger.claimRequestSlot(NOW + 1000), { allowed: true, retryAfterMs: 0 });
});

test("the global request gate enforces rolling 250 requests / 300 seconds, not fixed buckets", (t) => {
  const { ledger } = setup(t);
  for (let group = 0; group < 50; group++) {
    for (let n = 0; n < 5; n++) assert.equal(ledger.claimRequestSlot(NOW + group * 1000).allowed, true);
  }
  assert.deepEqual(ledger.claimRequestSlot(NOW + 50_000), { allowed: false, retryAfterMs: 250_000 });
  assert.deepEqual(ledger.claimRequestSlot(NOW + 299_999), { allowed: false, retryAfterMs: 1 });
  for (let n = 0; n < 5; n++) assert.equal(ledger.claimRequestSlot(NOW + 300_000).allowed, true);
  assert.deepEqual(ledger.claimRequestSlot(NOW + 300_000), { allowed: false, retryAfterMs: 1000 });
});

test("a failed SQL write rolls back rate-window pruning and keeps reservations unchanged", (t) => {
  const { storage, ledger } = setup(t);
  ledger.claimRequestSlot(NOW);
  storage.beforeExec = (query) => {
    if (query.startsWith("INSERT INTO provider_requests")) throw new Error("Synthetic SQLite failure");
  };
  assert.throws(() => ledger.claimRequestSlot(NOW + 300_000), /Synthetic SQLite failure/);
  storage.beforeExec = null;
  assert.equal(storage.sql.exec("SELECT COUNT(*) AS n FROM provider_requests").one().n, 1);
  storage.beforeExec = (query) => {
    if (query.startsWith("INSERT INTO render_reservations")) throw new Error("Synthetic SQLite failure");
  };
  assert.throws(() => reserve(ledger), /Synthetic SQLite failure/);
  storage.beforeExec = null;
  assert.equal(ledger.summary("session-1", NOW).total.reservedUnits, 0);
});

test("invalid limits, IDs, hashes, timestamps and raw error text are rejected", (t) => {
  const { storage, ledger } = setup(t);
  for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "2"]) {
    throwsCode(() => new Ledger(storage, { ...LIMITS, totalUnits: value }), "invalid_input");
  }
  throwsCode(() => new Ledger(storage, undefined), "invalid_input");
  const zero = new Ledger(storage, { totalUnits: 0, dailyUnits: 0, sessionDailyUnits: 0 });
  throwsCode(() => reserve(zero), "limit_exceeded");
  throwsCode(() => reserve(ledger, "https://sensitive.example/image.jpg"), "invalid_input");
  throwsCode(() => reserve(ledger, "render-1", "session-1", NOW, "not-a-digest"), "invalid_input");
  throwsCode(() => reserve(ledger, "render-1", "session-1", Infinity), "invalid_input");
  reserve(ledger);
  throwsCode(() => ledger.markPending("session-1", "render-1", "Bearer a secret from a raw error", NOW), "invalid_input");
  throwsCode(() => ledger.markPending("session-1", "render-1", "timeout", NOW - 1), "invalid_input");
});

test("returned metadata and summary are detached, and storage has no image or signed-URL column", (t) => {
  const { storage, ledger } = setup(t);
  const first = reserve(ledger).record;
  first.status = "succeeded";
  const summary = ledger.summary("session-1", NOW);
  summary.total.reservedUnits = 0;
  assert.equal(ledger.get("session-1", "render-1").status, "reserved");
  assert.equal(ledger.summary("session-1", NOW).total.reservedUnits, 2);
  const columns = storage.sql.exec("PRAGMA table_info(render_reservations)").toArray().map((column) => column.name);
  assert.equal(columns.some((name) => /image|photo|url|header|api_key/i.test(name)), false);
});
