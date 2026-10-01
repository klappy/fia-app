// Build stamp for C-16 `appVersion` (semver + 7-char sha, C-14). L0/C-14 owns emitting
// `<meta name="fia-release">`; until it does, the stamp is the package version with a zero sha,
// which the pattern accepts and which triage can recognise as "unstamped build".
import pkg from '../../package.json';

const STAMP = /^\d+\.\d+\.\d+\+[a-f0-9]{7}$/;
export const UNSTAMPED = `${pkg.version}+0000000`;

export function appVersion(doc: Pick<Document, 'querySelector'> | undefined = globalThis.document) {
  const v = doc?.querySelector?.('meta[name="fia-release"]')?.getAttribute('content') ?? '';
  return STAMP.test(v) ? v : UNSTAMPED;
}
