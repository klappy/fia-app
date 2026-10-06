import {createGuideDiscoveryAdapter} from './discovery.mjs';
import {createObservedStreamAcquisition} from './observed-stream-acquisition.mjs';
import {createGuideExecutor} from './guide-executor.mjs';
/** Explicit execution capability only. No default activation or playback admission. */
export async function createStreamedGuideExecutor({acquisitionPolicy,sourceEligibility,fetchSource,makeStream,now,...options}){
 options={...options,metadataBytes:new Uint8Array(options.metadataBytes),registryBytes:new Uint8Array(options.registryBytes),modelRecipe:structuredClone(options.modelRecipe),presentationAliases:structuredClone(options.presentationAliases||[]),...(options.canonicalP1?{canonicalP1:Object.fromEntries(Object.entries(options.canonicalP1).map(([k,v])=>[k,new Uint8Array(v)]))}:{})};
 const discovery=await createGuideDiscoveryAdapter({metadataBytes:options.metadataBytes,metadataSha256:options.metadataSha256,bucket:options.bucket});
 const acquisition=await createObservedStreamAcquisition({storage:options.storage,bucket:options.bucket,validatePublisherURL:discovery.validatePublisherURL,eligibility:sourceEligibility,policy:acquisitionPolicy,...(fetchSource?{fetchSource}:{}),...(makeStream?{makeStream}:{}),...(now?{now}:{})});
 return createGuideExecutor({...options,acquisition});
}

// Install only through the existing trusted capability injection. Creating this
// object does not activate any deployed Worker or grant recognition authority.
export async function createStreamedGuideCapabilities({acquisitionPolicy,eligibility,recognitionFactory,recognitionSha256,artifactPolicySha256,modelRecipe,sourceExecutionPolicy,fetchSource,makeStream}){
 const {canonicalJSONString,sha256}=await import('../contract.mjs');
 const policy=structuredClone(acquisitionPolicy),recognize=recognitionFactory,eligible=eligibility;
 if(typeof eligible!=='function'||typeof recognize!=='function'||![recognitionSha256,artifactPolicySha256].every(x=>/^[a-f0-9]{64}$/.test(x)))throw Error('streamed-guide-capability');
 const profile={schema:'fia-guide-execution-profile@1',acquisitionSha256:await sha256(canonicalJSONString({schema:'fia-observed-stream-acquisition@1',policy})),recognitionSha256,artifactPolicySha256,...(modelRecipe?{modelRecipe:structuredClone(modelRecipe)}:{}),...(sourceExecutionPolicy?{sourceExecutionPolicy:structuredClone(sourceExecutionPolicy)}:{})};
 return {profile,eligibility:eligible,create(ports){
  const acquired=createObservedStreamAcquisition({storage:ports.storage,bucket:ports.bucket,validatePublisherURL:ports.validatePublisherURL,eligibility:evidence=>{if(ports.beforeSourceFetch()!==true)return false;const value=eligible({metadataSha256:evidence.discovery.metadataSha256,packId:evidence.input.packId,resource:evidence.input.resource,presentationRevision:evidence.input.source.version,url:evidence.discovery.source.url,observedSourceSha256:evidence.observedContent?.sha256??null});if(value&&typeof value.then==='function'){Promise.resolve(value).catch(()=>{});return false;}return value===true;},policy,...(fetchSource?{fetchSource}:{}),...(makeStream?{makeStream}:{})});
  // Initialization errors are consumed even if admission ends before run.
  acquired.catch(()=>{});
  return {acquisition:{paid:false,dependencySha256:profile.acquisitionSha256,async run(args){const adapter=await acquired;if(adapter.dependencySha256!==profile.acquisitionSha256)throw Error('streamed-guide-profile');return adapter.run(args);}},recognition:recognize(ports)};
 }};
}
