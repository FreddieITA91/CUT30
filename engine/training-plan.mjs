// Prospective plan snapshots. No user data is committed; storage is private Sheets.
export const PLAN_HEADERS=['id','data','programma','confermato_utc','versione','scheda_json'];
const programs=['Upper A','Lower A','Cardio H + core','Upper B','Lower B','Cardio Z','Recupero'];
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const nonnegative=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const str=(v,label)=>{if(typeof v!=='string'||!v.trim())throw Error(label+' non valido');return v;};
const optionalNumber=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function buildTrainingPlan(draft,exercises,learning=null){
  if(!draft||!validDate(draft.date)||!programs.includes(draft.program)||!draft.cardio||!Array.isArray(exercises))throw Error('Bozza scheda non valida');
  if(draft.status==='giornata_gia_conclusa')throw Error('Giornata già conclusa');
  const phases=(draft.cardio.phases||[]).map(p=>{
    if(!positive(p.duration_min)||!positive(p.target_average_hr_bpm)||!Array.isArray(p.indicative_range_bpm)||p.indicative_range_bpm.length!==2||
      !p.indicative_range_bpm.every(positive)||p.target_average_hr_bpm<p.indicative_range_bpm[0]||p.target_average_hr_bpm>p.indicative_range_bpm[1]||
      !Array.isArray(p.treadmill_speed_kmh)||p.treadmill_speed_kmh.length!==2||!p.treadmill_speed_kmh.every(nonnegative)||
      p.treadmill_speed_kmh[0]>p.treadmill_speed_kmh[1]||!nonnegative(p.incline_pct))throw Error('Fase cardio non valida');
    return {label:str(p.label,'Fase'),duration_min:p.duration_min,target_average_hr_bpm:p.target_average_hr_bpm,
      indicative_range_bpm:[...p.indicative_range_bpm],treadmill_speed_kmh:[...p.treadmill_speed_kmh],incline_pct:p.incline_pct};
  });
  const minutes=phases.reduce((a,p)=>a+p.duration_min,0);
  if(minutes!==draft.cardio.duration_min||!nonnegative(draft.core_minutes)||(!minutes&&draft.cardio.target_average_hr_bpm!==null))throw Error('Durate incoerenti');
  const weighted=minutes?Math.round(phases.reduce((a,p)=>a+p.duration_min*p.target_average_hr_bpm,0)/minutes*10)/10:null;
  if(weighted!==draft.cardio.target_average_hr_bpm)throw Error('FC complessiva incoerente');
  const known=new Set();
  const items=exercises.map(e=>{
    const id=str(e.id,'ID esercizio');
    if(known.has(id))throw Error('Esercizio duplicato');known.add(id);
    if(!Number.isInteger(e.sets)||e.sets<1)throw Error('Serie non valide');
    const ref=draft.progression?.strength?.find(x=>x.exercise_id===id);
    return {id,name:str(e.name,'Esercizio'),dose:str(e.dose,'Dose'),rest:str(e.rest,'Recupero'),sets:e.sets,muscle:String(e.muscle||''),
      references:(ref?.references||[]).map(r=>({exercise:String(r.exercise||''),gym:String(r.gym||''),equipment:String(r.equipment||''),unit:String(r.unit||''),date:String(r.date||''),
        reference_kg:optionalNumber(r.reference_kg),reference_reps:optionalNumber(r.reference_reps),reference_rir:optionalNumber(r.reference_rir),reference_rpe:optionalNumber(r.reference_rpe),conditional_target_reps:optionalNumber(r.conditional_target_reps),
        load_increase_allowed:r.load_increase_allowed===true,action:String(r.action||''),note:String(r.note||'')}))};
  });
  if(/^(Upper|Lower) /.test(draft.program)&&!items.length)throw Error('Scheda pesi priva di esercizi');
  if(draft.program==='Cardio H + core'&&!items.length)throw Error('Scheda core priva di esercizi');
  return {schema_version:'1.0',date:draft.date,program:draft.program,source:String(draft.source||''),
    cardio:{duration_min:minutes,target_average_hr_bpm:weighted,phases},core_minutes:draft.core_minutes,exercises:items,
    guidance:(learning?.actions||[]).map(a=>String(a.text||'')).filter(Boolean),
    note:'Obiettivi prospettici condizionati a recupero, tecnica e tolleranza. I riferimenti FC sono indicativi; nessuna prestazione è registrata dalla conferma.'};
}
const hasValue=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
const actualMetric=w=>['durata_pesi_min','durata_cardio_min','durata_core_min','distanza_cardio_km','passi_tapis','kcal_attive','fc_media','fc_max'].some(k=>hasValue(w[k])&&Number(w[k])>0);
export function canConfirmPlan(plan,today,evidence={}){
  if(!validDate(today)||!validDate(plan?.date))throw Error('Data non valida');
  if(plan.date<today)return {ok:false,reason:'Data passata: non è possibile creare obiettivi retroattivi.'};
  const date=plan.date;
  if((evidence.plans||[]).some(x=>x.data===date))return {ok:false,reason:'Scheda già confermata: obiettivo originale preservato.'};
  if((evidence.workouts||[]).some(x=>x.data===date&&x.stato!=='annullato'&&(x.stato==='completato'||actualMetric(x))))return {ok:false,reason:'Prestazioni già registrate: conferma prospettica non disponibile.'};
  if((evidence.calendar||[]).some(x=>x.data===date&&x.stato==='completato'))return {ok:false,reason:'Giornata già conclusa.'};
  if((evidence.exercises||[]).some(x=>x.data===date&&String(x.completato).toLowerCase()==='true')||
    (evidence.loads||[]).some(x=>x.data===date)||(evidence.segments||[]).some(x=>x.data===date))
    return {ok:false,reason:'Evidenze di allenamento già presenti: obiettivo non retroattivo.'};
  return {ok:true,reason:null};
}
export function makePlanRecord(plan,confirmedAt){
  if(!validDate(plan?.date)||!programs.includes(plan.program)||plan.schema_version!=='1.0'||!Number.isFinite(Date.parse(confirmedAt)))throw Error('Conferma non valida');
  const json=JSON.stringify(plan);
  if(json.length>45000)throw Error('Scheda troppo grande per una cella Sheets');
  return {id:'plan-'+plan.date.replaceAll('-',''),data:plan.date,programma:plan.program,confermato_utc:confirmedAt,versione:plan.schema_version,scheda_json:json};
}
export function readPlanRecord(record){
  if(!record||record.versione!=='1.0')throw Error('Versione scheda non supportata');
  const p=JSON.parse(record.scheda_json);
  if(p.date!==record.data||p.program!==record.programma||p.schema_version!==record.versione||record.id!=='plan-'+p.date.replaceAll('-','')||
    !Array.isArray(p.exercises)||!Array.isArray(p.cardio?.phases)||!Number.isFinite(Date.parse(record.confermato_utc)))throw Error('Scheda archiviata incoerente');
  return p;
}
