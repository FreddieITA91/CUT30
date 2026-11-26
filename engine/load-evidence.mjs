// Independent read-only load source: no optional tabs or bridge initialization dependency.
export const LOAD_HEADERS=['id','data','programma','esercizio','numero_serie','carico_kg','ripetizioni','unita_carico','origine','updated_at'];
export function parseLoads(values){
 if(!Array.isArray(values)||!values.length||LOAD_HEADERS.some((k,i)=>String(values[0]?.[i]??'').trim()!==k))throw Error('Intestazioni Carichi non valide');
 return values.slice(1).filter(r=>r&&String(r[0]??'').trim()).map(r=>Object.fromEntries(LOAD_HEADERS.map((k,i)=>[k,r[i]??''])));
}
export async function readLoads(api){
 const r=await api('/values/'+encodeURIComponent("'Carichi'!A:J")+'?valueRenderOption=UNFORMATTED_VALUE');
 return parseLoads(r.values);
}
