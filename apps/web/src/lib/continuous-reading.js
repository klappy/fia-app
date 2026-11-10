const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v) && !/^0+$/.test(v);
const finite = Number.isFinite;
const validRange = r => r && finite(r.startSeconds) && finite(r.endSeconds) && r.startSeconds >= 0 && r.endSeconds > r.startSeconds;

// One delivered file's descriptor passes the same identity, mapping and verified-timing checks for every span of a
// session: the bytes selected for playback (audioSha256), the source they were cut from, the delivery URL and the
// source→delivery mapping evidence must all agree with the first span's. A descriptor failing any of them is not a span.
function sameFile(f, first, audioSha256, path) {
 const r = f?.playbackRange, t = f?.timing, mapping = first.timing.mapping;
 return !!f && f.path === path && f.sha256 === audioSha256 && f.sourceSha256 === first.sourceSha256 && f.deliveryURL === first.deliveryURL && t?.status === 'verified' && t.deliveryAudioSha256 === audioSha256 && t.sourceAudioSha256 === first.sourceSha256 && t.mappingEvidenceSha256 === first.timing.mappingEvidenceSha256 && t.mapping?.scale === mapping.scale && t.mapping?.offsetSeconds === mapping.offsetSeconds && validRange(r) && finite(f.duration) && r.endSeconds > 0 && r.endSeconds <= f.duration && !f.scripturePlaybackMode;
}
function firstFile(f, audioSha256) {
 if (!f || f.sha256 !== audioSha256 || !hash(f.sourceSha256) || !f.deliveryURL || !hash(f.timing?.mappingEvidenceSha256)) return null;
 const mapping = f.timing.mapping;
 if (!mapping || !finite(mapping.scale) || mapping.scale <= 0 || !finite(mapping.offsetSeconds)) return null;
 return f;
}

// Call only with descriptors already admitted by the delivery verifier. This planner does not
// download or verify bytes. audioSha256 is the hash of the bytes actually selected for playback.
// A replay starts the authored screen at its intro, including when currentId is a middle row.
export function planContinuousReading({activities, currentId, descriptorFor, src, fileKey, audioSha256, listContracts}) {
 const current = activities?.find(a => a.id === currentId), groupId = current?.readingGroupId;
 if (!groupId || !hash(audioSha256) || !src || !fileKey || typeof descriptorFor !== 'function') return null;
 const rows = activities.filter(a => a.readingGroupId === groupId);
 if (rows.length < 2 || rows[0].id !== groupId || rows.some((a,i) => a.kind !== 'guide' || a.completion !== 'auto' || !a.sourceText?.trim() || activities.indexOf(a) !== activities.indexOf(rows[0])+i)) return null;
 const contract = listContracts?.find(c=>c.id===groupId);
 if (!contract || contract.layout !== 'together' || contract.progression !== 'auto' || !['descriptive-list','explanation'].includes(contract.purpose) || JSON.stringify([contract.introId,...(contract.itemIds||[])]) !== JSON.stringify(rows.map(a=>a.id))) return null;
 const files = rows.map(a => descriptorFor(a.audioSrc));
 const first = firstFile(files[0], audioSha256);
 if (!first) return null;
 for (let i=0;i<files.length;i++) {
  const f = files[i];
  if (!sameFile(f, first, audioSha256, rows[i].audioSrc)) return null;
  if (i) {
   const prev = files[i-1], gap = f.playbackRange.startSeconds-prev.playbackRange.endSeconds;
   if (gap < 0) return null;
   // The authored together contract explicitly keeps these consecutive rows in one
   // utterance. Its approved outer bounds include the original recording's internal
   // pauses/numbering; never infer this authority from recording identity alone.

  }
 }
 const spans = rows.map((a,i) => ({id:a.id,text:a.sourceText,src,fileKey,range:{...files[i].playbackRange}}));
 return {kind:'together',groupId,spans,range:{startSeconds:spans[0].range.startSeconds,endSeconds:spans.at(-1).range.endSeconds}};
}

// Audio is the player and the pages turn to the audio (captain, 2026-11-09). A RUN is the consecutive same-file
// spans in activity order from the current clip up to and including the first confirmation stop (a discussion
// question), or up to a file change, a screen with no recording, or a screen the caller stops before (stopBefore).
// The controller plays the run's outer range once, seeks over every inter-clip gap (the spoken question numbers and
// "I will pause the audio here" cues live there) and turns the page by the clock. No list contract is required:
// an authored together-list keeps its own behaviour and wins when the current clip opens one. A run that cannot
// be planned (fewer than two spans, an unverified first descriptor) returns null and the app plays the clip on its
// own as before: that fallback is the safety gate. The last span's range is authored here; the app may extend it.
export function planRun({activities, currentId, descriptorFor, src, fileKey, audioSha256, listContracts, stopBefore}) {
 const together = planContinuousReading({activities, currentId, descriptorFor, src, fileKey, audioSha256, listContracts});
 if (together) return together;
 const start = Array.isArray(activities) ? activities.findIndex(a => a.id === currentId) : -1;
 if (start < 0 || !hash(audioSha256) || !src || !fileKey || typeof descriptorFor !== 'function') return null;
 const playable = a => ['guide','discussion'].includes(a?.kind) && ['auto','confirm'].includes(a.completion) && typeof a.audioSrc === 'string' && !!(a.narration || a.sourceText)?.trim();
 if (!playable(activities[start])) return null;
 const first = firstFile(descriptorFor(activities[start].audioSrc), audioSha256);
 if (!first || !sameFile(first, first, audioSha256, activities[start].audioSrc)) return null;
 const rows = [activities[start]], files = [first];
 if (activities[start].completion !== 'confirm') for (let i = start + 1; i < activities.length; i++) {
  const a = activities[i];
  if (!playable(a) || typeof stopBefore === 'function' && stopBefore(a)) break;
  const f = descriptorFor(a.audioSrc);
  // A different file, an unverified descriptor or a range out of order ends the run before this screen; that
  // screen then plays on its own with its own checks.
  if (!sameFile(f, first, audioSha256, a.audioSrc) || f.playbackRange.startSeconds < files.at(-1).playbackRange.endSeconds) break;
  rows.push(a); files.push(f);
  if (a.completion === 'confirm') break;
 }
 if (rows.length < 2) return null;
 const spans = rows.map((a,i) => ({id:a.id,text:a.narration||a.sourceText,src,fileKey,range:{...files[i].playbackRange}}));
 const last = rows.at(-1);
 return {kind:'run',spans,confirm:last.completion==='confirm',range:{startSeconds:spans[0].range.startSeconds,endSeconds:spans.at(-1).range.endSeconds}};
}
