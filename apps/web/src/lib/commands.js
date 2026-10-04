/** Deterministic prototype command adapter, not LLM inference or Jev execution.
 * Returns {event,response,speak?}; event:null means no engine mutation.
 */
export function parseCommand(input) {
  const text = String(input || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?,]/g, '').replace(/\s+/g, ' ').trim();
  const reply = (event, response) => ({ event, response });
  const negated = /\b(dont|don't|never|not|no|avoid|without)\b/.test(text);
  const preferenceOff = negated || /\b(stop|disable|off)\b/.test(text);
  if (!text) return reply(null, 'Try “show the map”, “continue”, or “always read passages aloud”.');
  if (/^(please )?read (me )?(the )?(passage|scripture|verses) next( please)?$/.test(text)) {
    return reply({ type: 'QUEUE_NEXT', assetId: 'scripture' }, 'I’ll open Scripture after this narration or when you continue, and hold your place in the guide.');
  }
  if (/\b(always|automatically|every time|never)\b/.test(text) && /\b(read|passages|scripture)\b/.test(text)) {
    const value = !preferenceOff;
    return reply({ type: 'SET_PREFERENCE', key: 'readScripture', value }, value ? 'I’ll read Scripture aloud when we reach it. This preference is saved on this device.' : 'Scripture will stay on screen for you to read. Tap Continue when ready.');
  }
  if (/\b(always|automatically|every time|never)\b/.test(text) && /\b(describe|images|pictures)\b/.test(text)) {
    const value = !preferenceOff;
    return reply({ type: 'SET_PREFERENCE', key: 'describeImages', value }, value ? 'I’ll play image and map descriptions after the FIA instruction.' : 'Automatic image descriptions are off.');
  }
  if (/\b(autoplay|automatically play)\b/.test(text) && /\b(video|videos)\b/.test(text)) {
    const value = !preferenceOff;
    return reply({ type: 'SET_PREFERENCE', key: 'autoplayVideo', value }, value ? 'Videos will try to play automatically when their activity begins. Your browser may require a tap.' : 'Videos will wait for you to press Play.');
  }
  // A bounded parser must not turn a negated or compound request into its opposite.
  // Explicit negative preferences above are supported; other negatives require no mutation.
  if (negated) return reply(null, 'I haven’t changed the activity. For this prototype, use a positive navigation command or change a playback preference in Settings.');
  if (/^(pause|stop|hold on|wait)( please)?$/.test(text)) return reply({ type: 'PAUSE' }, 'Paused. Your place is preserved.');
  if (/^(play|resume|start|begin|read it|read aloud)( please)?$/.test(text)) return reply({ type: 'PLAY' }, 'Playback requested for the current activity.');
  if (/^(continue|next|go on|we are ready|we're ready|done|skip)( please)?$/.test(text)) return reply({ type: 'CONTINUE' }, 'Continue advances the guide. If you are exploring an asset, return to the guide first.');
  if (/^(back|previous|go back)( please)?$/.test(text)) return reply({ type: 'BACK' }, 'Returning to the previous place.');
  if (/^(return|return to (the )?guide|back to (the )?guide|close|close this|resume (the )?guide)$/.test(text)) return reply({ type: 'RETURN' }, 'Returning to the guide at your saved place. Tap Play to resume paused narration.');
  if (/^(unpin|unpin this|release|clear pin)$/.test(text)) return reply({ type: 'UNPIN' }, 'Released the supporting visual.');
  if (/^(pin|pin this|keep this|keep this visible)$/.test(text)) return reply({ type: 'PIN' }, 'Keeping this visual as supporting content until you unpin it.');
  if (/\b(scripted|guided|conversation|conversational)\b/.test(text) && /\b(mode|switch|use)\b/.test(text)) {
    const mode = /\b(scripted|guided)\b/.test(text) ? 'scripted' : 'conversation';
    return reply({ type: 'SET_MODE', mode }, `Switched to ${mode} mode. Your activity and position are preserved.`);
  }
  const asset = /\b(map)\b/.test(text) ? 'map' : /\b(image|picture|photo)\b/.test(text) ? 'image' : /\b(video|film)\b/.test(text) ? 'video' : /\b(scripture|passage|verses|bible)\b/.test(text) ? 'scripture' : null;
  if (asset && /\b(show|open|see|look|describe|read|watch)\b/.test(text)) {
    return reply({ type: 'DETOUR', assetId: asset }, `Opening the ${asset}. Your guide position is saved; return when you’re ready.`);
  }
  return reply(null, 'This prototype understands navigation and presentation commands, not open-ended questions yet. Try “show the map”, “pause”, “return to guide”, or “always describe images”.');
}
