// Local test proxy boundary. Never forward an arbitrary browser Origin as trusted.
export function previewRequest(url,headers,localOrigin,workerOrigin){
 if(!url.startsWith('/')||url.startsWith('//'))throw Error('Invalid preview request target');
 const forwarded=new Headers(headers),origin=forwarded.get('origin');
 if(origin!==null&&origin!==localOrigin)throw Error('Untrusted preview origin');
 if(origin!==null)forwarded.set('origin',workerOrigin);
 forwarded.set('host',new URL(workerOrigin).host);
 return {url:new URL(url,workerOrigin).href,headers:forwarded};
}
