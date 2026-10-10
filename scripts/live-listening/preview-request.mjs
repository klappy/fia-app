// Local test proxy boundary. Never forward an arbitrary browser Origin as trusted.
export function previewRequest(url,headers,localOrigin,workerOrigin){
 if(!url.startsWith('/')||url.startsWith('//')||/[\\\x00-\x20\x7f]/.test(url))throw Error('Invalid preview request target');
 const forwarded=new Headers(headers),origin=forwarded.get('origin');
 if(origin!==null&&origin!==localOrigin)throw Error('Untrusted preview origin');
 if(origin!==null)forwarded.set('origin',workerOrigin);
 forwarded.set('host',new URL(workerOrigin).host);
 const target=new URL(url,workerOrigin);if(target.origin!==workerOrigin)throw Error('Invalid preview target origin');
 return {url:target.href,headers:forwarded};
}
