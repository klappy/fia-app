// Only update an existing root worker at the known previous URL; never register a new one.
export async function retirePreviousWorker() {
 if(!('serviceWorker' in navigator))return;
 try {
  for(const registration of await navigator.serviceWorker.getRegistrations()) {
   const worker=registration.active || registration.waiting || registration.installing;
   if(registration.scope===`${location.origin}/` && worker?.scriptURL===`${location.origin}/sw.js`)await registration.update();
  }
 } catch(error) { console.warn('Previous offline worker update is unavailable; reconnect and reload.',error); }
}
