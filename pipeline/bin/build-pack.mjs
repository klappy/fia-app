#!/usr/bin/env node
import { buildPack } from '../src/pericope.mjs';
const [lang, pericope] = process.argv.slice(2);
if (!lang || !pericope) { console.error('usage: build-pack.mjs <lang> <pericope>   e.g. build-pack.mjs spa MRK-1-1-13'); process.exit(2); }
const { manifest } = await buildPack(lang, pericope);
console.log(JSON.stringify({ packId: manifest.packId, counts: manifest.counts, textBytes: manifest.tiers.text.bytes, resourceTypes: manifest.resourceTypes }));
