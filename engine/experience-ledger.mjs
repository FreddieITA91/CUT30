// Append-only evaluation revisions. The ledger is an audit trail, never an XP input.
export const EXPERIENCE_HEADERS=['id','data','programma','esito','xp_proposti','xp_applicati','xp_cumulativi','livello_precedente','livello_successivo','versione','profilo','evidenze_json','registrato_utc'];
const str=x=>String(x??'');
const same=(a,b)=>EXPERIENCE_HEADERS.every((_,i)=>str(a[i])===str(b[i]));
const sameContent=(a,b)=>EXPERIENCE_HEADERS.slice(1,-1).every((_,i)=>str(a[i+1])===str(b[i+1]));
export function experienceRows(xp,at){
 if(!xp||xp.provisional||!xp.calibrated)throw Error('Completa la calibrazione e carica lo storico prima di archiviare');
 return xp.events.map((e,i)=>{
  const previous=i?xp.events[i-1].level:xp.baseline.level;
  return ['',e.date,e.program,e.outcome,e.points,e.applied,e.total,previous,e.level,xp.version,xp.baseline.profile,JSON.stringify(e.evidence),at];
 });
}
export function planExperienceAppend(existing,desired){
 if(!Array.isArray(existing)||!Array.isArray(desired))throw Error('Registro esperienza non valido');
 if(existing.length&&EXPERIENCE_HEADERS.some((k,i)=>str(existing[0][i])!==k))throw Error('Schema Esperienza inatteso: nessuna scrittura');
 const byDate=new Map(),ids=new Set();
 for(const row of existing.slice(1)){
  if(!row?.[0])continue;
  if(ids.has(str(row[0])))throw Error('ID duplicato nel registro Esperienza');
  ids.add(str(row[0]));byDate.set(str(row[1]),row);
 }
 const result=[];
 for(const row of desired){
  if(!row[1]||!row[9])throw Error('Valutazione incompleta');
  if(byDate.has(str(row[1]))&&sameContent(byDate.get(str(row[1])),row))continue;
  const stem='xp-'+row[1]+'-'+row[9];let revision=1;
  while(ids.has(stem+'-r'+revision))revision++;
  const out=[stem+'-r'+revision,...row.slice(1)];ids.add(out[0]);byDate.set(str(row[1]),out);result.push(out);
 }
 return result;
}
export function verifyExperienceAppend(rows,expected){
 return expected.every(x=>rows.filter(r=>str(r[0])===str(x[0])).length===1&&rows.some(r=>same(r,x)));
}
export async function archiveExperience({api,assertSource,xp,at}){
 const desired=experienceRows(xp,at);if(!desired.length)return {inserted:0};
 const call=async(...args)=>{assertSource();const r=await api(...args);assertSource();return r;};
 const meta=await call('?fields=sheets.properties.title');
 if(!meta.sheets?.some(s=>s.properties.title==='Esperienza')){
  await call(':batchUpdate','POST',{requests:[{addSheet:{properties:{title:'Esperienza',gridProperties:{rowCount:1000,columnCount:EXPERIENCE_HEADERS.length,frozenRowCount:1}}}}]});
 }
 const range="'Esperienza'!A:M",read='/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE';
 let before=(await call(read)).values||[];
 if(!before.length){await call('/values/'+encodeURIComponent("'Esperienza'!A1:M1")+'?valueInputOption=RAW','PUT',{values:[EXPERIENCE_HEADERS]});before=(await call(read)).values||[];}
 const rows=planExperienceAppend(before,desired);
 if(!rows.length)return {inserted:0};
 // Re-read before append; concurrent edits fail closed rather than overwrite.
 const latest=(await call(read)).values||[];
 if(JSON.stringify(latest)!==JSON.stringify(before))throw Error('Registro modificato durante la lettura: riprova');
 await call('/values/'+encodeURIComponent(range)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS','POST',{values:rows});
 const after=(await call(read)).values||[];
 if(!verifyExperienceAppend(after,rows))throw Error('Verifica registro non riuscita: aggiorna prima di riprovare');
 return {inserted:rows.length};
}
