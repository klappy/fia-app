#!/usr/bin/env node
import { buildCatalog } from '../src/inventory.mjs';
const appVersion = process.argv[2] || process.env.FIA_APP_VERSION || '0.2.0+0000000';
const { manifest, coverage } = await buildCatalog({ appVersion });
console.error(`catalog: ${manifest.entries.length} entries, ${manifest.languages.length} languages`);
console.log(JSON.stringify(coverage, null, 2));
