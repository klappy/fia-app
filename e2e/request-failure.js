/** Only the observed edge beacon cancellation during main-frame navigation is nonfatal.
 * Keep diagnostics: this is not permission to ignore telemetry outages or app failures.
 */
export function isNavigationBeaconCancellation({url,method,errorText,expectedOrigin,navigating}){
 if(!navigating||method!=='POST'||errorText!=='net::ERR_ABORTED')return false;
 try{const target=new URL(url);return target.origin===new URL(expectedOrigin).origin&&target.pathname==='/cdn-cgi/rum'&&target.search===''&&target.hash==='';}catch{return false;}
}
