#!/usr/bin/env node
import { buildRights } from '../src/rights.mjs';
const records = await buildRights();
console.error(`rights: ${records.length} records -> data/rights/records.json, data/rights/NOTICE.md`);
