// The historical generated-source inventory remains provenance, not playback permission.
// Call after verified delivery replacements so original publisher recordings survive.
export function recordingAllowed(file, generatedPaths) {
 if (!generatedPaths.has(file.path)) return true;
 return file.group === 'audio' && !!file.deliveryURL &&
  (!!file.recordingLedgerEntryId && !!file.recordingLedgerSha256 ||
   !!file.scriptureLedgerEntryId && !!file.scriptureLedgerSha256);
}
export function permittedRecordings(files, generatedPaths) {
 return files.filter(file => recordingAllowed(file, generatedPaths));
}
