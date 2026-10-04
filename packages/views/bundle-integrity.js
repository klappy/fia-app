// Exact accepted local projection. This is integrity, never media applicability.
const digest='83bce265b0f72cac99f0de2ec8ad117dd60c30f6853c9c98d4be033061c991e6';
export async function validateBundle(bundle) {
 if(bundle?.schemaVersion!==2 || bundle.recipeIdentity!=='bundled-passage-v1@2') throw Error('Unsupported bundle');
 const bytes=new TextEncoder().encode(JSON.stringify(bundle));
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 if(actual!==digest) throw Error('Bundle content integrity failed');
 return bundle;
}
