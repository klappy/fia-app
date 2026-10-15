export function reactiveWorkerInput(){
 const pack=$state({id:'eng.MRK-1-14-20',revision:'a'.repeat(64),mediaIdentity:{packId:'eng.MRK-1-14-20',revision:'b'.repeat(64)},mediaAssetsSha256:'c'.repeat(64)});
 const sizes=$state({image:'small',audio:'medium',video:'prepared'});
 return {pack,sizes};
}
