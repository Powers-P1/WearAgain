import { YouCamClient, inspectImage } from '../../src/youcam/index.ts';
import { createUnitLedgerClass } from './unit-ledger.js';

// Wrangler bundles the TypeScript client; Node integration tests inject its
// compiled equivalent into the same class factory.
export class UnitLedger extends createUnitLedgerClass({ clientFactory: options => new YouCamClient(options), inspectImage }) {}
export { default } from './app.js';
