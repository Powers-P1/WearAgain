// Skeleton only: /health plus a SQLite Durable Object placeholder (unit ledger comes later).
export class UnitLedger {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch() {
    return Response.json({ ok: true, ledger: 'placeholder' });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, version: env.VERSION ?? 'unknown' });
    }
    if (url.pathname === '/do-check') {
      const stub = env.UNIT_LEDGER.get(env.UNIT_LEDGER.idFromName('wearagain-global-v1'));
      return stub.fetch(request);
    }
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  },
};
