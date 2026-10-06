// Transport-independent read validation; storage/publication authority stays with the caller.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>object(value)&&Object.keys(value).every(k=>allowed.includes(k));
const validId=x=>typeof x==='string'&&x.length<=80&&(/^[a-z0-9][a-z0-9-]{0,79}$/.test(x)||/^(eng|spa)\.MRK-[0-9]+-[0-9]+(?:-[0-9]+){1,2}$/.test(x));
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const refused=()=>({status:'refused',code:'invalid-request'});
export function createReadOperations({readCatalog,findArtifact}) {
  return {
    readPack(args) {
      if(!keys(args,['packId','revision'])||!validId(args.packId)||('revision'in args&&!validHash(args.revision)))return refused();
      return readCatalog(args.packId,args.revision);
    },
    readArtifact(args) {
      if(!keys(args,['sha256'])||!validHash(args.sha256))return refused();
      const outcome=found=>found?.status?found:found?{status:'ready',artifact:found.artifact,content:found.content,...(found.cacheControl==='private, no-store'?{cacheControl:found.cacheControl}:{})}:{status:'unavailable',reason:'not-found'};
      const found=findArtifact(args.sha256);return found?.then?found.then(outcome):outcome(found);
    },
  };
}
