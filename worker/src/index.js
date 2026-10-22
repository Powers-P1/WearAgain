import { YouCamClient, inspectImage } from '../../src/youcam/index.ts';
import { createUnitLedgerClass } from './unit-ledger.js';
import {runStylist} from '../../src/agent/runner.ts';
import {parseAgentSnapshot,PROCEDURES} from '../../src/agent/contract.ts';

// Wrangler bundles the TypeScript client; Node integration tests inject its
// compiled equivalent into the same class factory.
export class UnitLedger extends createUnitLedgerClass({ clientFactory: options => new YouCamClient(options), inspectImage,agentRunner:runStylist,parseAgentSnapshot,agentProcedures:PROCEDURES }) {}
export { default } from './app.js';
