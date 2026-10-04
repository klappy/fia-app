export class Catalog {
  #current=new Map(); #history=new Map(); #preparing=new Set();
  constructor(artifacts){this.artifacts=artifacts;}
  publish({packId,bytes,metadata,expectedRevision}) {
    const prior=this.#current.get(packId)||null;
    if(expectedRevision!==prior)return {status:'refused',code:'revision-conflict',currentRevision:prior};
    const artifact=this.artifacts.put(bytes);
    const record=Object.freeze({...structuredClone(metadata),status:'ready',packId,revision:artifact.sha256,artifact});
    let revisions=this.#history.get(packId);if(!revisions){revisions=new Map();this.#history.set(packId,revisions);}
    revisions.set(record.revision,record);this.#current.set(packId,record.revision);this.#preparing.delete(packId);
    return structuredClone(record);
  }
  registerPreparing(packId){if(!this.#current.has(packId))this.#preparing.add(packId);}
  read(packId,revision) {
    const chosen=revision||this.#current.get(packId);
    const record=this.#history.get(packId)?.get(chosen);
    if(record)return structuredClone(record);
    if(!revision&&this.#preparing.has(packId))return {status:'preparing',packId,retryAfterSeconds:30};
    return {status:'unavailable',packId,reason:revision?'revision-not-found':'not-found'};
  }
}
