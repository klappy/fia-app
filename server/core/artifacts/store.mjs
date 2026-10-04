import {createHash} from 'node:crypto';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export class ArtifactStore {
  #files=new Map();
  put(input,mime='application/json') {
    const bytes=Buffer.from(input), hash=sha256(bytes), old=this.#files.get(hash);
    if(old&&!old.bytes.equals(bytes))throw Error('artifact-conflict');
    if(!old)this.#files.set(hash,{bytes,mime});
    return {sha256:hash,bytes:bytes.length,mime,path:`/v1/artifacts/${hash}`};
  }
  get(hash) {
    const value=this.#files.get(hash);
    return value?{bytes:Buffer.from(value.bytes),descriptor:{sha256:hash,bytes:value.bytes.length,mime:value.mime,path:`/v1/artifacts/${hash}`}}:null;
  }
  get size(){return this.#files.size;}
}
