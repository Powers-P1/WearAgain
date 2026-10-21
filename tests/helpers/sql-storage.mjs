import { DatabaseSync } from "node:sqlite";

/** Real SQLite adapter for the synchronous Cloudflare storage surface in tests. */
export function createSqlStorage(filename = ":memory:") {
  const db = new DatabaseSync(filename);
  let depth = 0;
  const storage = {
    db,
    beforeExec: null,
    sql: {
      exec(query, ...bindings) {
        storage.beforeExec?.(query, bindings);
        const rows = db.prepare(query).all(...bindings).map((row) => ({ ...row }));
        return {
          toArray: () => rows.map((row) => ({ ...row })),
          one() {
            if (rows.length !== 1) throw new Error("Expected one row");
            return { ...rows[0] };
          },
          [Symbol.iterator]: () => rows[Symbol.iterator](),
        };
      },
    },
    transactionSync(callback) {
      const name = `test_transaction_${depth++}`;
      db.exec(`SAVEPOINT ${name}`);
      try {
        const result = callback();
        if (result && typeof result.then === "function") throw new Error("Transaction callback must be synchronous");
        db.exec(`RELEASE ${name}`);
        return result;
      } catch (error) {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        throw error;
      } finally {
        depth--;
      }
    },
    close() { db.close(); },
  };
  return storage;
}
