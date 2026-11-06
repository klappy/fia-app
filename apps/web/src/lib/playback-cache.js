/** Bounded derived audio URLs. Keep the current owner, including paused playback,
 * until it releases the source. Evict its idle player before revoking the URL. */
export function createPlaybackCache(cap, {activeUrl, evict, revoke}) {
  const entries = new Map(), retired = new Set();
  const url = value => typeof value === 'string' ? value : value.url;
  function remove(key, value) {
    entries.delete(key); retired.delete(key); evict(key); revoke(url(value));
  }
  function trim() {
    for (const [key,value] of entries) {
      if (url(value) === activeUrl()) continue;
      if (retired.has(key) || entries.size > cap) remove(key,value);
    }
  }
  return {
    get(key) { const value=entries.get(key); if(value!==undefined){entries.delete(key);entries.set(key,value);} return value; },
    set(key,value) {
      const old=entries.get(key);
      if(old!==undefined && url(old)!==url(value)) throw Error('Audio identity changed without release');
      entries.set(key,value); retired.delete(key); trim();
    },
    values:()=>entries.values(), get size(){return entries.size;},
    retain(keys) { const keep=new Set(keys); for(const key of entries.keys())if(!keep.has(key))retired.add(key);trim(); },
    clear() { for(const key of entries.keys())retired.add(key);trim(); }, trim
  };
}
