// Transport-independent read validation; storage/publication authority stays with the caller.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>object(value)&&Object.keys(value).every(k=>allowed.includes(k));
const validId=x=>typeof x==='string'&&x.length<=80&&(/^[a-z0-9][a-z0-9-]{0,79}$/.test(x)||/^(eng|spa)\.(?:MRK|LUK)-[0-9]+-[0-9]+(?:-[0-9]+){1,2}$/.test(x));
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const refused=()=>({status:'refused',code:'invalid-request'});
export function createReadOperations({readCatalog,findArtifact}) {
  return {
    readPack(args) {
      // execution:'2' is a page's capability to receive visual resources; the read itself is unchanged.
      // generation (F7a1, OFFLINE "Exact selection") needs revision and never falls back.
      if(!keys(args,['packId','revision','execution','generation'])||!validId(args.packId)||('revision'in args&&!validHash(args.revision))||('execution'in args&&args.execution!=='2')||('generation'in args&&(!validHash(args.generation)||!('revision'in args))))return refused();
      // Terry 0be2e40 case (c): a refusal reaches the client with its own typed reason, never merged into one (OFFLINE L43). A ready
      // record of another revision or generation (a catalog that does not select by generation) is typed apart; no law decides it yet.
      if('generation'in args){const exact=r=>r?.status&&r.status!=='ready'?r:r?.status==='ready'&&r.revision===args.revision&&r.execution?.publication?.generation===args.generation?r:{status:'unavailable',reason:'publication-generation-mismatch'};const r=readCatalog(args.packId,args.revision,args.generation);return r?.then?r.then(exact):exact(r);}
      return readCatalog(args.packId,args.revision);
    },
    readArtifact(args) {
      if(!keys(args,['sha256'])||!validHash(args.sha256))return refused();
      const outcome=found=>found?.status?found:found?{status:'ready',artifact:found.artifact,content:found.content,...(found.cacheControl==='private, no-store'?{cacheControl:found.cacheControl}:{})}:{status:'unavailable',reason:'not-found'};
      const found=findArtifact(args.sha256);return found?.then?found.then(outcome):outcome(found);
    },
  };
}
