// Private cardio detail; never add these totals to existing Allenamenti totals.
export const CARDIO_HEADERS=['id','data','programma','modalita','numero_segmento','durata_min','distanza_km','velocita_kmh','passo_sec_100m','pendenza_pct','kcal_attive','fc_media','fc_max','passi_tapis','updated_at'];
export const MODES=['tapis','piscina','cyclette','ellittica','camminata','corsa','altro'];
const optional=(v,min,max,name,integer=false)=>{
  if(v===null||v===undefined||String(v).trim()==='')return null;
  const n=Number(v);
  if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw new Error(name+' non valido');
  return n;
};
export function validateCardioSegment(input){
  const date=String(input.data||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Data non valida');
  const mode=String(input.modalita||'');
  if(!MODES.includes(mode))throw new Error('Modalità non valida');
  const number=optional(input.numero_segmento,1,99,'Numero segmento',true);
  const duration=optional(input.durata_min,0.1,600,'Durata');
  if(number===null||duration===null)throw new Error('Numero segmento e durata obbligatori');
  const out={id:'cardio-'+date.replaceAll('-','')+'-'+number,data:date,programma:String(input.programma||''),modalita:mode,numero_segmento:number,durata_min:duration,
    distanza_km:optional(input.distanza_km,0.001,500,'Distanza'),
    velocita_kmh:optional(input.velocita_kmh,0.1,150,'Velocità'),
    passo_sec_100m:optional(input.passo_sec_100m,1,3600,'Andatura',true),
    pendenza_pct:optional(input.pendenza_pct,-30,50,'Pendenza'),
    kcal_attive:optional(input.kcal_attive,0,10000,'Calorie'),
    fc_media:optional(input.fc_media,30,250,'FC media',true),
    fc_max:optional(input.fc_max,30,250,'FC massima',true),
    passi_tapis:optional(input.passi_tapis,0,100000,'Passi',true),
    updated_at:String(input.updated_at||'')};
  if(out.fc_media!==null&&out.fc_max!==null&&out.fc_max<out.fc_media)throw new Error('FC massima inferiore alla media');
  if(mode!=='tapis'&&(out.pendenza_pct!==null||out.passi_tapis!==null))throw new Error('Pendenza e passi tapis solo per tapis');
  if(mode!=='piscina'&&out.passo_sec_100m!==null)throw new Error('Andatura per 100 m riservata alla piscina');
  return out;
}
export function summarizeCardioSegments(raw,date){
  if(!Array.isArray(raw))throw new Error('Segmenti non validi');
  const source=raw.filter(x=>x&&x.data===date);
  const grouped=new Map();
  for(const r of source){
    const s=validateCardioSegment(r);
    const prior=grouped.get(s.id);
    if(prior&&prior.updated_at===s.updated_at&&JSON.stringify(prior)!==JSON.stringify(s))throw new Error('Segmenti duplicati in conflitto');
    if(!prior||s.updated_at>=prior.updated_at)grouped.set(s.id,s);
  }
  const rows=[...grouped.values()].sort((a,b)=>a.numero_segmento-b.numero_segmento);
  const round=n=>Math.round(n*100)/100;
  const sum=(key,subset=rows)=>{const known=subset.filter(x=>x[key]!==null);return {value:known.length?round(known.reduce((s,x)=>s+x[key],0)):null,complete:subset.length>0&&known.length===subset.length};};
  const hrRows=rows.filter(x=>x.fc_media!==null);
  const maxRows=rows.filter(x=>x.fc_max!==null);
  const hrMinutes=hrRows.reduce((s,x)=>s+x.durata_min,0);
  const modes=Object.fromEntries(MODES.filter(m=>rows.some(x=>x.modalita===m)).map(m=>{const subset=rows.filter(x=>x.modalita===m);return [m,{minutes:round(subset.reduce((s,x)=>s+x.durata_min,0)),distance:sum('distanza_km',subset),kcal:sum('kcal_attive',subset)}]}));
  return {rows,minutes:round(rows.reduce((s,x)=>s+x.durata_min,0)),distance:sum('distanza_km'),kcal:sum('kcal_attive'),treadmill_steps:sum('passi_tapis',rows.filter(x=>x.modalita==='tapis')),
    hr_mean:hrMinutes?round(hrRows.reduce((s,x)=>s+x.fc_media*x.durata_min,0)/hrMinutes):null,hr_coverage_minutes:round(hrMinutes),
    hr_max:maxRows.length?Math.max(...maxRows.map(x=>x.fc_max)):null,hr_max_complete:rows.length>0&&maxRows.length===rows.length,modes,
    note:'Riepilogo dei soli segmenti registrati; non sommare ai totali giornalieri. Dati mancanti non stimati.'};
}
