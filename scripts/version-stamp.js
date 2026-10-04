import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const git=(...args)=>{try{return execFileSync('git',args,{encoding:'utf8'}).trim();}catch{return null;}};
export function createStamp(env=process.env) {
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
 const commit=env.WORKERS_CI_COMMIT_SHA || env.GITHUB_SHA || git('rev-parse','HEAD');
 if(!/^[a-f0-9]{40}$/.test(commit || ''))throw Error('Build requires a full source commit');
 const builtAt=new Date().toISOString();
 return {version:pkg.version,commit,branch:env.WORKERS_CI_BRANCH || env.GITHUB_REF_NAME || git('branch','--show-current') || 'unknown',builtAt,
 built_by:env.GITHUB_ACTIONS==='true'?'GitHub Actions':env.WORKERS_CI_COMMIT_SHA?'Cloudflare Workers Builds':'local build',built_at:builtAt,
 attestation:env.GITHUB_ACTIONS==='true' && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID?`https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`:'unavailable'};
}
export function versionStamp(){const stamp=createStamp();return {name:'fia-version-stamp',apply:'build',transformIndexHtml:()=>[{tag:'meta',attrs:{name:'fia-release',content:`${stamp.version}+${stamp.commit.slice(0,7)}`},injectTo:'head'}],generateBundle(){this.emitFile({type:'asset',fileName:'version.json',source:JSON.stringify(stamp,null,2)+'\n'});}};}
