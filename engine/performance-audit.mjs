// Evidence-based, reproducible assessment; never writes or overwrites manual ratings.
import {rowsFromSheet,byIdLatest,readSetEffort} from './cut30.mjs';
import {readPlanRecord} from './training-plan.mjs';
import {summarizeCardioSegments} from './cardio-segments.mjs';
export const AUDIT_HEADERS=['id','data','programma','valutato_utc','versione','voto_proposto','esito','audit_json'];
const n=v=>v==null||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
const norm=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
const latest=(raw,tab)=>byIdLatest(rowsFromSheet(raw[tab]||[],tab));
const metric=(actual,target)=>({actual,target,status:target===0?'non_richiesto':actual===null?'non_verificabile':actual>=target?'raggiunto':'sotto_obiettivo'});
const identity=v=>{const m=String(v||'').match(/^(kg macchina|kg per mano|kg totale)\s*\|\s*palestra\s+([^|]+)\s*\|\s*attrezzo\s+([^|]+)$/i);return m?[norm(m[1]),norm(m[2]),norm(m[3])]:null;};
const result=(status,reason)=>({status,reason,rating:null});
export function auditPerformance(raw,date){
  const plans=rowsFromSheet(raw.SchedeConfermate||[],'SchedeConfermate').filter(p=>p.data===date);
  if(plans.length!==1)return result('non_valutabile',plans.length?'Schede duplicate':'Obiettivo prospettico assente');
  let p;try{p=readPlanRecord(plans[0]);}catch{return result('non_valutabile','Scheda archiviata non valida');}
  const candidates=latest(raw,'Allenamenti').filter(w=>w.data===date&&w.stato!=='annullato');
  if(candidates.length!==1)return result('non_valutabile',candidates.length?'Sessioni duplicate: riconciliare':'Consuntivo assente');
  const w=candidates[0];
  if(w.stato!=='completato')return result('in_attesa','Sessione non conclusa');
  if(w.programma!==p.program)return result('non_valutabile','Programma eseguito differente da quello confermato');
  if(!Number.isFinite(Date.parse(w.updated_at))||Date.parse(w.updated_at)<=Date.parse(plans[0].confermato_utc))return result('non_valutabile','Cronologia conferma/consuntivo non verificabile');
  const cardio=metric(n(w.durata_cardio_min),p.cardio.duration_min),core=metric(n(w.durata_core_min),p.core_minutes);
  const checks=latest(raw,'Esercizi').filter(x=>x.data===date&&x.programma===p.program);
  const loads=latest(raw,'Carichi').filter(x=>x.data===date&&x.programma===p.program);
  const strength=/^(Upper|Lower) /.test(p.program);
  const required=(strength||p.program==='Cardio H + core')?p.exercises:[];
  const exercises=required.map(e=>{
    const rows=checks.filter(x=>x.esercizio===e.id);
    const checked=rows.length===1&&String(rows[0].completato).toLowerCase()==='true';
    const names=e.name.split('/').map(norm);
    const matching=loads.filter(x=>names.includes(norm(x.esercizio))&&identity(x.unita_carico)&&n(x.carico_kg)>=0&&n(x.carico_kg)!==null&&Number.isInteger(n(x.ripetizioni))&&n(x.ripetizioni)>0&&readSetEffort(x.origine).tipo_serie==='allenante');
    const keys=new Set(),duplicate=new Set();
    for(const x of matching){const key=JSON.stringify([norm(x.esercizio),identity(x.unita_carico),n(x.numero_serie)]);if(keys.has(key))duplicate.add(key);keys.add(key);}
    const eligible=matching.filter(x=>Number.isInteger(n(x.numero_serie))&&n(x.numero_serie)>0&&!duplicate.has(JSON.stringify([norm(x.esercizio),identity(x.unita_carico),n(x.numero_serie)])));
    const refMatches=[];
    for(const ref of e.references||[]){
      const group=eligible.filter(x=>norm(x.esercizio)===norm(ref.exercise)&&JSON.stringify(identity(x.unita_carico))===JSON.stringify([norm(ref.unit),norm(ref.gym),norm(ref.equipment)]));
      const kg=n(ref.reference_kg),reps=n(ref.reference_reps);
      if(kg===null||reps===null||!group.length)continue;
      // Compare a working set against the recorded reference, at no worse known effort.
      const previousRir=n(ref.reference_rir);
      const proven=group.some(x=>{const rir=readSetEffort(x.origine).rir;return previousRir!==null&&rir!==null&&rir>=previousRir&&rir>=2&&((n(x.carico_kg)===kg&&n(x.ripetizioni)>reps)||(n(x.carico_kg)>kg&&n(x.ripetizioni)>=reps));});
      const descriptive=group.some(x=>(n(x.carico_kg)===kg&&n(x.ripetizioni)>reps)||(n(x.carico_kg)>kg&&n(x.ripetizioni)>=reps));
      refMatches.push({gym:ref.gym,equipment:ref.equipment,unit:ref.unit,reference_kg:kg,reference_reps:reps,matched_sets:group.length,improved_at_known_effort:proven,improved_descriptive:descriptive});
    }
    return {id:e.id,name:e.name,check:checked?'confermato':rows.length===1&&String(rows[0].completato).toLowerCase()==='false'?'non_eseguito':'non_verificabile',
      planned_sets:e.sets,recorded_working_sets:eligible.length,duplicate_sets:duplicate.size,references:refMatches,
      progression_proven:refMatches.some(x=>x.improved_at_known_effort)};
  });
  let hr=null,hrCoverage=false;
  try{const s=summarizeCardioSegments(rowsFromSheet(raw.CardioSegmenti||[],'CardioSegmenti'),date);hrCoverage=cardio.actual!==null&&cardio.actual>0&&Math.abs(s.minutes-cardio.actual)<0.05&&s.hr_coverage_minutes===s.minutes&&s.rows.every(x=>x.programma===p.program);if(hrCoverage)hr=s.hr_mean;}catch{/* fail closed */}
  const hrTarget=n(p.cardio.target_average_hr_bpm);
  const hrStatus=hrTarget===null?'non_richiesto':hr===null?'non_verificabile':hr>hrTarget+5?'sopra_riferimento':hr<hrTarget-5?'sotto_riferimento':'nel_riferimento';
  const requiredMetrics=[cardio,core].filter(x=>x.target>0);
  const confirmed=exercises.filter(x=>x.check==='confermato').length;
  const missed=exercises.filter(x=>x.check==='non_eseguito').length;
  const progress=exercises.filter(x=>x.progression_proven).length;
  const complete=requiredMetrics.every(x=>x.status==='raggiunto')&&confirmed===exercises.length;
  const explicitEvidence=requiredMetrics.some(x=>x.actual!==null)||confirmed>0||missed>0;
  if(!explicitEvidence)return result('non_valutabile','Nessuna evidenza misurabile degli obiettivi');
  const deficits=requiredMetrics.filter(x=>x.status==='sotto_obiettivo');
  const severe=deficits.some(x=>x.actual/x.target<0.5)||(exercises.length>0&&missed/exercises.length>0.5);
  const missing=requiredMetrics.some(x=>x.status==='non_verificabile')||exercises.some(x=>x.check==='non_verificabile');
  let rating=3;
  if(severe)rating=2;
  else if(complete&&progress>=1&&hrStatus!=='sopra_riferimento'&&hrStatus!=='non_verificabile')rating=4;
  // Rating 5 needs longitudinal high-quality evidence beyond this single-session audit.
  const strengths=[],issues=[],next=[];
  if(confirmed)strengths.push(confirmed+'/'+exercises.length+' esercizi confermati');
  if(cardio.status==='raggiunto')strengths.push('Volume cardio raggiunto');
  if(core.status==='raggiunto')strengths.push('Volume core raggiunto');
  if(progress)strengths.push(progress+' esercizi con progresso a sforzo comparabile');
  for(const [label,m] of [['Cardio',cardio],['Core',core]])if(m.status==='sotto_obiettivo'){issues.push(label+': '+m.actual+'/'+m.target+' min');next.push('Consolidare '+label.toLowerCase()+' previsto, se tollerato');}else if(m.status==='non_verificabile'){issues.push(label+': dato mancante');next.push('Registrare durata '+label.toLowerCase());}
  if(missed)issues.push(missed+' esercizi dichiarati non eseguiti');
  if(exercises.some(x=>x.check==='non_verificabile'))issues.push('Checklist incompleta: non equivale a esercizi saltati');
  if(hrStatus==='sopra_riferimento'){issues.push('FC cardio sopra riferimento indicativo');next.push('Regolare velocità o pendenza, non inseguire picchi');}
  if(hrStatus==='non_verificabile'){issues.push('FC cardio non verificabile dai segmenti');next.push('Registrare segmenti con copertura completa');}
  if(!progress&&strength)next.push('Registrare serie allenanti, stesso attrezzo e RIR per confronti verificabili');
  return {status:'valutato',schema_version:'1.0',date,program:p.program,plan_id:plans[0].id,
    plan_confirmed_at:plans[0].confermato_utc,workout_id:w.id,workout_updated_at:w.updated_at,
    rating, outcome:rating===4?'Crescita documentata':rating===2?'Mantenimento debole':'Mantenimento',
    adherence:{complete,missing,cardio,core,exercises,confirmed,planned:exercises.length},
    heart_rate:{actual:hr,target:hrTarget,status:hrStatus,coverage_verified:hrCoverage},
    progression:{verified_exercises:progress,scope:'prestazione registrata, non adattamento fisiologico'},
    strengths,issues,next,confidence:missing||hrStatus==='non_verificabile'?'limitata':'descrittiva',
    note:'Voto proposto, non diagnosi o certificazione fisiologica. 1 e 5 richiedono verifica longitudinale ulteriore. Nessun voto attribuito da calorie o picchi FC.'};
}
export function makeAuditRecord(a,at){
  if(a.status!=='valutato'||!Number.isFinite(Date.parse(at)))throw Error('Audit non archiviabile');
  const json=JSON.stringify(a);if(json.length>45000)throw Error('Audit troppo grande');
  return {id:'audit-'+a.date.replaceAll('-',''),data:a.date,programma:a.program,valutato_utc:at,versione:a.schema_version,voto_proposto:a.rating,esito:a.outcome,audit_json:json};
}
