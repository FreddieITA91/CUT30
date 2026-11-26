// CUT30 Level v1: reproducible game progression, not a clinical fitness scale.
import {byIdLatest,canonicalWorkouts,readSetEffort} from './cut30.mjs';
import {unitParts,norm} from './workout-log.mjs';
import {validateCardioSegment} from './cardio-segments.mjs';
export const LEVEL_VERSION='1.1';
export const BASELINE_PROFILES=Object.freeze({restart:{level:5,label:'Ripresa / principiante'},regular:{level:20,label:'Allenamento regolare'},experienced:{level:35,label:'Allenamento strutturato'},advanced:{level:50,label:'Esperienza avanzata'}});
export const xpForLevel=level=>{const n=Math.min(100,Math.max(1,Math.floor(Number(level)||1)))-1;return 100*n+5*n*(n-1);};
export const XP={improvement:35,maintenance:10,decline:-15,baseline:5,unknown:0};
const dayOK=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const n=v=>v==null||String(v).trim()===''||!Number.isFinite(Number(v))?null:Number(v);
const median=values=>{const a=[...values].sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
const close=(a,b,t)=>Math.abs(a-b)<=t;
const age=(a,b)=>(Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000;
export function levelFromXP(xp){
 let remaining=Math.max(0,Math.floor(Number(xp)||0)),level=1,step=100;
 while(level<100&&remaining>=step){remaining-=step;level++;step=100+10*(level-1);}
 return {level,into:level===100?0:remaining,step:level===100?0:step,remaining:level===100?0:step-remaining};
}
function strengthRows(raw){
 const rows=byIdLatest(raw),logical=new Map();
 for(const r of rows){
  if(!dayOK(r.data))continue;
  const u=unitParts(r.unita_carico),eff=readSetEffort(r.origine),kg=n(r.carico_kg),reps=n(r.ripetizioni),set=n(r.numero_serie);
  // Assisted loads have the opposite direction. Bodyweight and untagged legacy sets are not comparable.
  if(!u||!['kg macchina','kg per mano','kg totale'].includes(u.type)||!u.equipment.trim()||!r.esercizio||/assist|elastico|band|contrappeso/i.test(r.esercizio+' '+u.equipment)||eff.tipo_serie!=='allenante'||kg===null||kg<=0||!Number.isInteger(reps)||reps<3||reps>15||!Number.isInteger(set)||set<1)continue;
  const key=JSON.stringify([r.data,norm(r.programma),norm(r.esercizio),norm(u.type),norm(u.gym),norm(u.equipment),set]);
  const entry={date:r.data,program:r.programma,exercise:norm(r.esercizio),key:JSON.stringify([norm(r.programma),norm(r.esercizio),norm(u.type),norm(u.gym),norm(u.equipment),set]),kg,reps,rir:eff.rir,rpe:eff.rpe};
  if(!logical.has(key))logical.set(key,[]);logical.get(key).push(entry);
 }
 return [...logical.values()].filter(g=>g.length===1).map(g=>g[0]).filter(x=>x.rir!==null||x.rpe!==null);
}
function cardioRows(raw){
 const groups=new Map();
 for(const r of byIdLatest(raw)){
  let s;try{s=validateCardioSegment(r);}catch{continue;}
  if(!['tapis','piscina'].includes(s.modalita)||s.fc_media===null||s.distanza_km===null||s.durata_min<10||s.modalita==='tapis'&&s.pendenza_pct===null)continue;
  const key=JSON.stringify([s.data,s.programma,s.modalita,s.numero_segmento]);
  const out={date:s.data,program:s.programma,exercise:s.modalita,key:JSON.stringify([s.programma,s.modalita,s.numero_segmento]),duration:s.durata_min,hr:s.fc_media,incline:s.pendenza_pct,speed:s.distanza_km/s.durata_min*60};
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(out);
 }
 return [...groups.values()].filter(g=>g.length===1).map(g=>g[0]);
}
const effortMatch=(a,b)=>a.rir!==null&&b.rir!==null? a.rir===b.rir && (a.rpe===null||b.rpe===null||close(a.rpe,b.rpe,.5)):a.rpe!==null&&b.rpe!==null&&a.rpe===b.rpe;
// Directional dominance: higher reps at equal load is also progression.
function strengthDelta(a,b){
 const load=a.kg/b.kg-1,rep=a.reps-b.reps;
 if((load>=.03&&rep>=0)||(Math.abs(load)<.001&&rep>=1))return {direction:'up',delta:Math.abs(load)<.001?rep/b.reps:load};
 if((load<=-.05&&rep<=0)||(Math.abs(load)<.001&&rep<=-2))return {direction:'down',delta:Math.abs(load)<.001?rep/b.reps:load};
 return {direction:Math.abs(load)<.03&&rep===0?'flat':'uncertain',delta:load};
}
function speedDelta(a,b){const delta=a.speed/b.speed-1;return {delta,direction:delta>=.03?'up':delta<=-.05?'down':Math.abs(delta)<.03?'flat':'uncertain'};}
const cardioMatch=(a,b)=>close(a.hr,b.hr,5)&&Math.abs(a.duration/b.duration-1)<=.1&&(a.incline===null&&b.incline===null||a.incline!==null&&b.incline!==null&&close(a.incline,b.incline,.25));
function compare(current,history,match,change){
 const groups=new Map();
 for(const x of current){
  const prior=history.filter(y=>y.key===x.key&&y.date<x.date&&age(x.date,y.date)<=60&&match(x,y)).sort((a,b)=>b.date.localeCompare(a.date));
  // Exactly one comparable observation per prior date/key.
  const unique=[...new Map(prior.map(y=>[y.date,y])).values()].sort((a,b)=>b.date.localeCompare(a.date));
  if(!unique.length)continue;
  const last=unique[0],older=unique[1],{direction,delta}=change(x,last);
  const trend=direction==='down'?older&&match(last,older)&&change(last,older).direction==='down'?'down':'uncertain':direction;
  if(!groups.has(x.exercise))groups.set(x.exercise,[]);groups.get(x.exercise).push({trend,delta});
 }
 return [...groups.entries()].map(([exercise,rows])=>{
  const up=rows.filter(r=>r.trend==='up').length,down=rows.filter(r=>r.trend==='down').length,flat=rows.filter(r=>r.trend==='flat').length;
  const trend=up>rows.length/2?'up':down>rows.length/2?'down':flat>rows.length/2?'flat':'uncertain';
  return {exercise,trend,comparisons:rows.length,change:Math.round(median(rows.map(r=>r.delta))*1000)/10};
 });
}
export function readCalibration(value,today){
 if(!value)return null;
 try{const v=typeof value==='string'?JSON.parse(value):value;
 if(v.version!==1||!Object.hasOwn(BASELINE_PROFILES,v.profile)||!dayOK(v.date)||v.date>today)return null;
 return {version:1,profile:v.profile,date:v.date,level:BASELINE_PROFILES[v.profile].level,label:BASELINE_PROFILES[v.profile].label};
 }catch{return null;}
}
export function buildTrainingLevel({workouts=[],loads=[],segments=[],start,today,loadAvailable=false,cardioAvailable=false,calibration=null}={}){
 if(!dayOK(today)||!dayOK(start))throw Error('Periodo livello non valido');
 const sessions=canonicalWorkouts(workouts.filter(x=>x.stato!=='eliminato')).filter(x=>x.stato==='completato'&&x.data<=today&&x.programma!=='Recupero');
 const completed=new Map(sessions.map(w=>[w.data,w.programma]));
 const strength=loadAvailable?strengthRows(loads).filter(x=>completed.get(x.date)===x.program):[];
 const cardio=cardioAvailable?cardioRows(segments).filter(x=>completed.get(x.date)===x.program):[];
 const baseline=readCalibration(calibration,today),initialXP=baseline?xpForLevel(baseline.level):0;
 let total=0;const events=[],counts={improvement:0,maintenance:0,decline:0,baseline:0,unknown:0};
 for(const w of sessions.filter(x=>x.data>=start)){
  const s=compare(strength.filter(x=>x.date===w.data),strength,effortMatch,strengthDelta);
  const c=compare(cardio.filter(x=>x.date===w.data),cardio,cardioMatch,speedDelta);
  const evidence=[...s.map(x=>({...x,domain:'forza'})),...c.map(x=>({...x,domain:'cardio'}))],up=evidence.filter(x=>x.trend==='up').length,down=evidence.filter(x=>x.trend==='down').length,flat=evidence.filter(x=>x.trend==='flat').length;
  const positive=[w.durata_pesi_min,w.durata_cardio_min,w.durata_core_min].some(v=>n(v)>0);
  // Mixed or isolated declines remain unclassified; only repeated, consistent falls cost XP.
  const outcome=up>evidence.length/2&&down===0?'improvement':down>evidence.length/2&&up===0?'decline':flat>evidence.length/2&&up===0&&down===0?'maintenance':positive&&!evidence.length?'baseline':'unknown';
  const points=XP[outcome],before=total;total=Math.max(baseline&&w.data>=baseline.date?-initialXP:0,total+points);counts[outcome]++;
  events.push({date:w.data,program:w.programma,outcome,points,applied:total-before,total,level:baseline?levelFromXP(initialXP+total).level:null,evidence});
 }
 const recent=sessions.filter(w=>age(today,w.data)<28);
 const recentStrength=strength.filter(x=>age(today,x.date)<28),recentCardio=cardio.filter(x=>age(today,x.date)<28);
 const profile={sessions28:recent.length,weeks28:new Set(recent.map(w=>Math.floor(age(today,w.data)/7))).size,strengthExercises:new Set(recentStrength.map(x=>x.exercise)).size,cardioSessions:new Set(recentCardio.map(x=>x.date)).size};
 return {version:LEVEL_VERSION,total,...levelFromXP(initialXP+total),baseline,initialXP,calibrated:!!baseline,events,counts,profile,provisional:!loadAvailable||!cardioAvailable,loadAvailable,cardioAvailable};
}
