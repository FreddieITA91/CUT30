import {buildReport,suggestTrainingDraft,rowsFromSheet,byIdLatest,canonicalWorkouts} from './cut30.mjs';
import {reviewTrainingHistory} from './learning.mjs';
import {buildTrainingPlan,readPlanRecord} from './training-plan.mjs';
import {auditPerformance} from './performance-audit.mjs';
import {WORKOUTS} from './workout-catalog.mjs';
export const CYCLE_HEADERS=['data_analisi','generato_utc','versione','data_scheda','programma','stato_scheda','audit_valutabili','audit_non_valutabili','ciclo_json'];
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function romeDate(at=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at);
 const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));return m.year+'-'+m.month+'-'+m.day;
}
function configStart(raw){
 const r=raw.Config||[];const entries=Array.isArray(r[0])?r.slice(1).map(x=>({chiave:x[0],valore:x[1]})):r;
 const found=entries.filter(x=>x.chiave==='data_inizio');
 if(found.length>1)throw Error('Config duplicata');
 const start=found[0]?.valore||'2026-11-02';
 if(!validDate(start))throw Error('Data inizio non valida');return start;
}
export function buildDailyCycle(raw,asOf){
 if(!validDate(asOf))throw Error('Data ciclo non valida');
 const report=buildReport(raw,asOf);
 const work=canonicalWorkouts(rowsFromSheet(raw.Allenamenti||[],'Allenamenti'));
 const dates=work.filter(w=>w.stato==='completato'&&w.data>=report.window.from&&w.data<=asOf).map(w=>w.data);
 const plans=rowsFromSheet(raw.SchedeConfermate||[],'SchedeConfermate');
 const calendar=byIdLatest(rowsFromSheet(raw.Calendario||[],'Calendario')).filter(x=>!['eliminato','annullato'].includes(x.stato));
 const ratings=byIdLatest(rowsFromSheet(raw.Valutazioni||[],'Valutazioni'));
 const audits=dates.map(date=>{
   const a=auditPerformance(raw,date);
   return {date,status:a.status,rating:a.rating,outcome:a.outcome||null,reason:a.reason||null,
     confidence:a.confidence||null,issues:a.issues||[],next:a.next||[],verified_exercises:a.progression?.verified_exercises??null,
     manual_rating_present:ratings.some(x=>x.data===date&&x.voto_1_5!==''&&x.voto_1_5!=null)};
 });
 const target=work.some(w=>w.data===asOf&&w.stato==='completato')||calendar.some(x=>x.data===asOf&&x.stato==='completato')?shift(asOf,1):asOf;
 let next;
 try{
   const overrides=calendar.filter(x=>x.data===target);
   if(overrides.length>1)throw Error('Calendario ambiguo');
   const options={start_date:configStart(raw),...(overrides.length?{program:overrides[0].programma}:{})};
   const saved=plans.filter(x=>x.data===target);
   if(saved.length>1)throw Error('Schede duplicate');
   if(saved.length){
      const plan=readPlanRecord(saved[0]);
      next={date:target,program:plan.program,status:'obiettivo_gia_confermato',plan,reason:null};
   }else{
      const d0=suggestTrainingDraft(raw,target,options);
      const exercise=WORKOUTS[d0.program]||[];
      const d=suggestTrainingDraft(raw,target,{...options,exercises:/^(Upper|Lower) /.test(d0.program)?exercise:[]});
      if(d.status==='giornata_gia_conclusa')throw Error('Giornata già conclusa');
      const learning=reviewTrainingHistory(raw,d);
      const plan=buildTrainingPlan(d,exercise,learning);
      const started=work.some(w=>w.data===target&&w.stato!=='annullato')||rowsFromSheet(raw.Carichi||[],'Carichi').some(x=>x.data===target)||rowsFromSheet(raw.CardioSegmenti||[],'CardioSegmenti').some(x=>x.data===target)||rowsFromSheet(raw.Esercizi||[],'Esercizi').some(x=>x.data===target&&String(x.completato).toLowerCase()==='true');
      next={date:target,program:d.program,status:started?'riferimento_seduta_iniziata':'bozza_da_confermare',plan,reason:null};
   }
 }catch{next={date:target,program:null,status:'non_disponibile',plan:null,reason:'Verificare calendario, schema o obiettivi archiviati.'};}
 return {schema_version:'1.0',as_of:asOf,report,audits,next,summary:{evaluable:audits.filter(x=>x.status==='valutato').length,not_evaluable:audits.filter(x=>x.status!=='valutato').length},
 note:'Proposte automatiche: non registrano prestazioni, non confermano obiettivi e non sostituiscono valutazioni manuali.'};
}
export function cycleRow(c,at){
 // Keep the derived JSON bounded; exclude detailed nutrition and raw source records.
 const detail={schema_version:c.schema_version,as_of:c.as_of,audits:c.audits,next:c.next,summary:c.summary,note:c.note};
 const json=JSON.stringify(detail);if(json.length>45000)throw Error('Ciclo troppo grande');
 return [c.as_of,at,c.schema_version,c.next.date,c.next.program??'',c.next.status,c.summary.evaluable,c.summary.not_evaluable,json];
}
// Pure idempotent upsert planner; never touch a source table or a different date.
export function planDailyWrite(existing,headers,row){
 if(!Array.isArray(existing)||row.length!==headers.length)throw Error('Schema output non valido');
 if(existing.length&&(existing[0].length!==headers.length||headers.some((v,i)=>existing[0][i]!==v)))throw Error('Schema output inatteso');
 const matches=existing.map((r,i)=>i>0&&r[0]===row[0]?i:-1).filter(i=>i>0);
 if(matches.length>1)throw Error('Data output duplicata');
 return {headerNeeded:!existing.length,rowNumber:matches.length?matches[0]+1:Math.max(existing.length+1,2),row};
}
