/**
 * The SQLite authority for the single provider key. Every mutation is synchronous
 * in one Durable Object transaction; no provider I/O belongs inside this class.
 * A reservation is never an expiring lease: an ambiguous outcome stays charged
 * against the budget until there is positive evidence of success or a free error.
 */
export const UNITS_PER_RENDER = 2;
const DAY_MS = 86_400_000;
const WINDOW_MS = 300_000;
const QPS_WINDOW_MS = 1_000;
const TERMINAL = new Set(["succeeded", "failed_free"]);

export class LedgerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "LedgerError";
    this.code = code;
    this.details = details;
  }
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new LedgerError("invalid_input", `${label} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function timestamp(value) {
  integer(value, "now");
  if (value > 8_640_000_000_000_000) throw new LedgerError("invalid_input", "Invalid timestamp");
  return value;
}

function opaque(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    throw new LedgerError("invalid_input", `${label} must be an opaque identifier`);
  }
  return value;
}

function identity(sessionId, renderKey) {
  return [opaque(sessionId, "sessionId"), opaque(renderKey, "renderKey")];
}

function providerTaskId(value) {
  // Match the client parser. An accepted task must not become untrackable
  // because the accounting layer imposed a smaller, unrelated ID limit.
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,1024}$/.test(value)) {
    throw new LedgerError("invalid_input", "Invalid provider task identifier");
  }
  return value;
}

function record(row) {
  if (!row) return null;
  return {
    sessionId: row.session_id,
    renderKey: row.render_key,
    requestHash: row.request_hash,
    status: row.status,
    units: row.units,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
    taskId: row.task_id,
    nextPollAt: row.next_poll_at,
    settledAt: row.settled_at,
    reason: row.reason,
  };
}

function bucket(limitUnits, spentUnits, reservedUnits) {
  integer(spentUnits, "spent units");
  integer(reservedUnits, "reserved units");
  const used = spentUnits + reservedUnits;
  integer(used, "used units");
  return { limitUnits, spentUnits, reservedUnits, remainingUnits: Math.max(0, limitUnits - used) };
}

/** Exact Cloudflare surface: storage.sql.exec and storage.transactionSync. */
export class Ledger {
  constructor(storage, limits) {
    if (!storage?.sql?.exec || typeof storage.transactionSync !== "function") {
      throw new LedgerError("invalid_input", "SQLite Durable Object storage is required");
    }
    if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
      throw new LedgerError("invalid_input", "Explicit budget limits are required");
    }
    this.storage = storage;
    this.sql = storage.sql;
    this.limits = Object.freeze({
      totalUnits: integer(limits.totalUnits, "totalUnits"),
      dailyUnits: integer(limits.dailyUnits, "dailyUnits"),
      sessionDailyUnits: integer(limits.sessionDailyUnits, "sessionDailyUnits"),
    });
    // This is an application schema. The existing Cloudflare class migration v1
    // remains intact; constructing the ledger is safe after every DO restart.
    this.storage.transactionSync(() => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS render_reservations (
        session_id TEXT NOT NULL,
        render_key TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('reserved', 'submitting', 'pending', 'succeeded', 'failed_free')),
        units INTEGER NOT NULL CHECK (units = 2),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        submitted_at INTEGER,
        task_id TEXT UNIQUE,
        next_poll_at INTEGER,
        settled_at INTEGER,
        reason TEXT,
        PRIMARY KEY (session_id, render_key)
      )`);
      this.sql.exec("CREATE INDEX IF NOT EXISTS render_due_tasks ON render_reservations(status, next_poll_at)");
      this.sql.exec("CREATE INDEX IF NOT EXISTS render_settled_at ON render_reservations(status, settled_at)");
      this.sql.exec(`CREATE TABLE IF NOT EXISTS provider_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requested_at INTEGER NOT NULL
      )`);
      this.sql.exec("CREATE INDEX IF NOT EXISTS provider_request_time ON provider_requests(requested_at)");
    });
  }

  get(sessionId, renderKey) {
    identity(sessionId, renderKey);
    return record(this.sql.exec(
      "SELECT * FROM render_reservations WHERE session_id = ? AND render_key = ?", sessionId, renderKey,
    ).toArray()[0]);
  }

  _required(sessionId, renderKey) {
    const current = this.get(sessionId, renderKey);
    if (!current) throw new LedgerError("not_found", "Render reservation was not found");
    return current;
  }

  _clock(current, now) {
    timestamp(now);
    if (now < current.updatedAt) throw new LedgerError("invalid_input", "Timestamp precedes the stored render state");
  }

  _summary(sessionId, now) {
    const start = Math.floor(now / DAY_MS) * DAY_MS;
    const end = start + DAY_MS;
    const row = this.sql.exec(`SELECT
      COALESCE(SUM(CASE WHEN status = 'succeeded' THEN units ELSE 0 END), 0) AS total_spent,
      COALESCE(SUM(CASE WHEN status NOT IN ('succeeded', 'failed_free') THEN units ELSE 0 END), 0) AS total_reserved,
      COALESCE(SUM(CASE WHEN status = 'succeeded' AND settled_at >= ? AND settled_at < ? THEN units ELSE 0 END), 0) AS daily_spent,
      COALESCE(SUM(CASE WHEN session_id = ? AND status = 'succeeded' AND settled_at >= ? AND settled_at < ? THEN units ELSE 0 END), 0) AS session_spent,
      COALESCE(SUM(CASE WHEN session_id = ? AND status NOT IN ('succeeded', 'failed_free') THEN units ELSE 0 END), 0) AS session_reserved
      FROM render_reservations`, start, end, sessionId, start, end, sessionId).toArray()[0];
    return {
      utcDay: new Date(now).toISOString().slice(0, 10),
      unitsPerRender: UNITS_PER_RENDER,
      total: bucket(this.limits.totalUnits, row.total_spent, row.total_reserved),
      // All unresolved holds, including older days, constrain today's budgets.
      // Settling yesterday's pending render today swaps its hold for today's spend.
      daily: bucket(this.limits.dailyUnits, row.daily_spent, row.total_reserved),
      sessionDaily: bucket(this.limits.sessionDailyUnits, row.session_spent, row.session_reserved),
    };
  }

  summary(sessionId, now) {
    opaque(sessionId, "sessionId");
    timestamp(now);
    return this.storage.transactionSync(() => this._summary(sessionId, now));
  }

  reserve({ sessionId, renderKey, requestHash, now }) {
    identity(sessionId, renderKey);
    timestamp(now);
    if (typeof requestHash !== "string" || !/^[a-f0-9]{64}$/.test(requestHash)) {
      throw new LedgerError("invalid_input", "requestHash must be a lowercase SHA-256 digest");
    }
    return this.storage.transactionSync(() => {
      const existing = this.get(sessionId, renderKey);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new LedgerError("conflict", "Render key already identifies a different request");
        return { created: false, record: existing };
      }
      const usage = this._summary(sessionId, now);
      for (const scope of ["total", "daily", "sessionDaily"]) {
        if (usage[scope].remainingUnits < UNITS_PER_RENDER) {
          throw new LedgerError("limit_exceeded", "Insufficient render units", { scope });
        }
      }
      this.sql.exec(`INSERT INTO render_reservations
        (session_id, render_key, request_hash, status, units, created_at, updated_at)
        VALUES (?, ?, ?, 'reserved', ?, ?, ?)`, sessionId, renderKey, requestHash, UNITS_PER_RENDER, now, now);
      return { created: true, record: this._required(sessionId, renderKey) };
    });
  }

  markSubmitting(sessionId, renderKey, now) {
    return this.storage.transactionSync(() => {
      const current = this._required(sessionId, renderKey);
      this._clock(current, now);
      // One-shot ownership boundary before the non-idempotent provider POST.
      // Never re-submit an ambiguous task, even when there is no task ID yet.
      if (current.status !== "reserved") throw new LedgerError("invalid_state", "Task submission was already claimed");
      this.sql.exec(`UPDATE render_reservations SET status = 'submitting', submitted_at = ?, updated_at = ?
        WHERE session_id = ? AND render_key = ?`, now, now, sessionId, renderKey);
      return this._required(sessionId, renderKey);
    });
  }

  attachTask(sessionId, renderKey, taskId, now) {
    providerTaskId(taskId);
    return this.storage.transactionSync(() => {
      const current = this._required(sessionId, renderKey);
      this._clock(current, now);
      if (current.taskId === taskId) return current;
      if (current.taskId !== null || !["submitting", "pending"].includes(current.status) || current.submittedAt === null) {
        throw new LedgerError("invalid_state", "A task cannot be attached in this state");
      }
      if (this.sql.exec("SELECT task_id FROM render_reservations WHERE task_id = ?", taskId).toArray().length) {
        throw new LedgerError("conflict", "Provider task already belongs to a reservation");
      }
      this.sql.exec(`UPDATE render_reservations SET task_id = ?, status = 'pending', next_poll_at = ?, updated_at = ?, reason = NULL
        WHERE session_id = ? AND render_key = ?`, taskId, now, now, sessionId, renderKey);
      return this._required(sessionId, renderKey);
    });
  }

  markPending(sessionId, renderKey, reason, now) {
    opaque(reason, "reason");
    return this.storage.transactionSync(() => {
      const current = this._required(sessionId, renderKey);
      this._clock(current, now);
      if (TERMINAL.has(current.status)) return current; // A late timeout cannot undo settlement.
      this.sql.exec(`UPDATE render_reservations SET status = 'pending', reason = ?, updated_at = ?
        WHERE session_id = ? AND render_key = ?`, reason, now, sessionId, renderKey);
      return this._required(sessionId, renderKey);
    });
  }

  setNextPoll(sessionId, renderKey, nextPollAt, now) {
    if (nextPollAt !== null) timestamp(nextPollAt);
    timestamp(now);
    if (nextPollAt !== null && nextPollAt < now) throw new LedgerError("invalid_input", "Next poll cannot be in the past");
    return this.storage.transactionSync(() => {
      const current = this._required(sessionId, renderKey);
      this._clock(current, now);
      if (TERMINAL.has(current.status)) return current;
      if (!current.taskId || current.status !== "pending") throw new LedgerError("invalid_state", "Only an attached pending task can be polled");
      this.sql.exec("UPDATE render_reservations SET next_poll_at = ?, updated_at = ? WHERE session_id = ? AND render_key = ?",
        nextPollAt, now, sessionId, renderKey);
      return this._required(sessionId, renderKey);
    });
  }

  stopPolling(sessionId, renderKey, reason, now) {
    opaque(reason, "reason");
    return this.storage.transactionSync(() => {
      const current = this._required(sessionId, renderKey);
      this._clock(current, now);
      if (TERMINAL.has(current.status)) return current;
      this.sql.exec(`UPDATE render_reservations SET status = 'pending', next_poll_at = NULL, reason = ?, updated_at = ?
        WHERE session_id = ? AND render_key = ?`, reason, now, sessionId, renderKey);
      return this._required(sessionId, renderKey);
    });
  }

  dueTasks(now, limit = 10) {
    timestamp(now);
    integer(limit, "limit", 1);
    if (limit > 100) throw new LedgerError("invalid_input", "Poll batch limit must be <= 100");
    return this.sql.exec(`SELECT * FROM render_reservations
      WHERE status = 'pending' AND task_id IS NOT NULL AND next_poll_at <= ?
      ORDER BY next_poll_at, session_id, render_key LIMIT ?`, now, limit).toArray().map(record);
  }

  settleSuccess(sessionId, renderKey, now) {
    return this.storage.transactionSync(() => {
      const current = this._required(sessionId, renderKey);
      this._clock(current, now);
      if (current.status === "succeeded") return current;
      if (current.status !== "pending" || !current.taskId) throw new LedgerError("invalid_state", "Success requires an attached pending task");
      this.sql.exec(`UPDATE render_reservations SET status = 'succeeded', settled_at = ?, updated_at = ?, next_poll_at = NULL, reason = NULL
        WHERE session_id = ? AND render_key = ?`, now, now, sessionId, renderKey);
      return this._required(sessionId, renderKey);
    });
  }

  settleFreeError(sessionId, renderKey, evidence, now) {
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
      throw new LedgerError("invalid_input", "Confirmed provider evidence is required");
    }
    const keys = Object.keys(evidence).sort().join(",");
    let reason;
    if (keys === "errorCode,httpStatus,kind" && evidence.kind === "create_validation" && evidence.errorCode === "InvalidParameters" && evidence.httpStatus === 400) {
      reason = "create_validation.InvalidParameters";
    } else if (keys === "errorCode,kind,taskId" && evidence.kind === "task_error" && evidence.errorCode === "error_decode_image") {
      providerTaskId(evidence.taskId);
      reason = "task_error.error_decode_image";
    } else {
      throw new LedgerError("invalid_input", "This error has no confirmed zero-charge evidence");
    }
    return this.storage.transactionSync(() => {
      const current = this._required(sessionId, renderKey);
      this._clock(current, now);
      if (current.status === "succeeded") throw new LedgerError("invalid_state", "A successful render cannot be refunded");
      if (current.status === "failed_free") {
        if (current.reason !== reason || (evidence.kind === "task_error" && current.taskId !== evidence.taskId)) {
          throw new LedgerError("conflict", "Terminal evidence disagrees with the recorded error");
        }
        return current;
      }
      if (evidence.kind === "task_error") {
        if (current.status !== "pending" || current.taskId !== evidence.taskId) {
          throw new LedgerError("invalid_state", "Error evidence must identify the attached task");
        }
      } else if (!["submitting", "pending"].includes(current.status) || current.taskId !== null || current.submittedAt === null) {
        throw new LedgerError("invalid_state", "Creation validation evidence is incompatible with this reservation");
      }
      this.sql.exec(`UPDATE render_reservations SET status = 'failed_free', reason = ?, settled_at = ?, updated_at = ?, next_poll_at = NULL
        WHERE session_id = ? AND render_key = ?`, reason, now, now, sessionId, renderKey);
      return this._required(sessionId, renderKey);
    });
  }

  /** Call before every provider/API, signed upload and result download request. */
  claimRequestSlot(now) {
    timestamp(now);
    return this.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM provider_requests WHERE requested_at <= ?", now - WINDOW_MS);
      const rows = this.sql.exec("SELECT requested_at FROM provider_requests ORDER BY requested_at, id").toArray();
      const recent = rows.filter(({ requested_at }) => requested_at > now - QPS_WINDOW_MS);
      let retryAfterMs = 0;
      if (rows.length >= 250) retryAfterMs = Math.max(retryAfterMs, rows[rows.length - 250].requested_at + WINDOW_MS - now);
      if (recent.length >= 5) retryAfterMs = Math.max(retryAfterMs, recent[recent.length - 5].requested_at + QPS_WINDOW_MS - now);
      if (retryAfterMs > 0) return { allowed: false, retryAfterMs };
      this.sql.exec("INSERT INTO provider_requests (requested_at) VALUES (?)", now);
      return { allowed: true, retryAfterMs: 0 };
    });
  }
}
