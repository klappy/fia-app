const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v) && !/^0+$/.test(v);
const finite = Number.isFinite;
const validRange = r => r && finite(r.startSeconds) && finite(r.endSeconds) && r.startSeconds >= 0 && r.endSeconds > r.startSeconds;

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
 const first = files[0];
 if (!first || first.sha256 !== audioSha256 || !hash(first.sourceSha256) || !first.deliveryURL || !hash(first.timing?.mappingEvidenceSha256)) return null;
 const mapping = first.timing.mapping;
 if (!mapping || !finite(mapping.scale) || mapping.scale <= 0 || !finite(mapping.offsetSeconds)) return null;
 for (let i=0;i<files.length;i++) {
  const f = files[i], r = f?.playbackRange, t = f?.timing;
  if (!f || f.path !== rows[i].audioSrc || f.sha256 !== audioSha256 || f.sourceSha256 !== first.sourceSha256 || f.deliveryURL !== first.deliveryURL || t?.status !== 'verified' || t.deliveryAudioSha256 !== audioSha256 || t.sourceAudioSha256 !== first.sourceSha256 || t.mappingEvidenceSha256 !== first.timing.mappingEvidenceSha256 || t.mapping?.scale !== mapping.scale || t.mapping?.offsetSeconds !== mapping.offsetSeconds || !validRange(r) || !finite(f.duration) || r.endSeconds > f.duration || f.scripturePlaybackMode) return null;
  if (i) {
   const prev = files[i-1], gap = r.startSeconds-prev.playbackRange.endSeconds;
   if (gap < 0) return null;
   // The authored together contract explicitly keeps these consecutive rows in one
   // utterance. Its approved outer bounds include the original recording's internal
   // pauses/numbering; never infer this authority from recording identity alone.

  }
 }
 const spans = rows.map((a,i) => ({id:a.id,text:a.sourceText,src,fileKey,range:{...files[i].playbackRange}}));
 return {groupId,spans,range:{startSeconds:spans[0].range.startSeconds,endSeconds:spans.at(-1).range.endSeconds}};
}
