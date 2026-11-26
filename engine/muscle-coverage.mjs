import {byIdLatest,readSetEffort} from './cut30.mjs';
import {WORKOUTS} from './workout-catalog.mjs';
export const GROUPS=['Petto','Schiena','Spalle','Braccia','Quadricipiti','Posteriori','Polpacci','Core'];
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases={
 bench:['bench press','panca piana bilanciere','chest press macchina'],row:['chest supported row','rematore supportato','rematore chest supported'],
 incline:['incline dumbbell press','panca inclinata con manubri'],pulldown:['lat pulldown','lat machine avanti'],
 shoulder:['shoulder press macchina','dumbbell shoulder press','military press'],lateral:['lateral raise','alzate laterali manubri'],
 curl:['biceps curl','curl con manubri','curl manubri'],pushdown:['triceps pushdown','push down tricipiti'],
 squat:['barbell squat','back squat','leg press 45','pressa'],rdl:['romanian deadlift','rdl'],split:['bulgarian split squat','affondi bulgari'],
 curlleg:['lying leg curl','leg curl sdraiato'],calf:['standing calf raise','calf'],crunch:['crunch ai cavi'],
 plank:[],deadbug:['deadbug'],pallof:[], 'ub-pullup':['pull up assistite','trazioni assistite macchina','lat pulldown'],
 'ub-dbpress':['dumbbell bench press','panca piana con manubri','panca piana manubri','distensioni con manubri'],
 'ub-cablerow':['seated cable row','pulley','pulley basso','rematore cavo'],'ub-chest':['cable fly','cable crossover','croci cavi'],
 'ub-rear':['rear delt fly','reverse pec deck'],'ub-lateral':['lateral raise','alzate laterali manubri'],
 'ub-bicep':['dumbbell curl','curl manubri','curl bicipiti','curl con singola barra'],'ub-tricep':['triceps extension','pushdown tricipiti','pushdown','triceps pushdown con corda'],
 'lb-press':['pressa','leg press 45'],'lb-hip':['barbell hip thrust'],'lb-extension':['leg extensions'],
 'lb-curl':['seated leg curl','leg curl'],'lb-calf':['standing calf raise','calf'],'lb-core':['hanging knee raises','sollevamento ginocchia alla sbarra']
};
const secondary={
 bench:['Spalle','Braccia'],row:['Braccia','Spalle'],incline:['Spalle','Braccia'],pulldown:['Braccia'],shoulder:['Braccia'],
 squat:['Posteriori','Core'],rdl:['Core'],split:['Posteriori','Core'],
 'ub-pullup':['Braccia'],'ub-dbpress':['Spalle','Braccia'],'ub-cablerow':['Braccia','Spalle'],'ub-rear':['Schiena'],
 'lb-press':['Posteriori'],'lb-hip':['Core'],'lb-core':[]
};
const names=e=>[e.id,e.name,...String(e.name).split('/'),...(aliases[e.id]||[])].map(norm);
export function resolveExercise(name,items){const key=norm(name);if(!key)return null;const hits=items.filter(e=>names(e).includes(key));return hits.length===1?hits[0]:null;}
const isMetric=e=>GROUPS.includes(e.muscle);
const validSeries=r=>r.numero_serie!==null&&r.numero_serie!==''&&Number.isInteger(Number(r.numero_serie))&&Number(r.numero_serie)>0&&r.ripetizioni!==null&&r.ripetizioni!==''&&Number.isInteger(Number(r.ripetizioni))&&Number(r.ripetizioni)>0;
const signature=r=>JSON.stringify([norm(r.esercizio),norm(r.unita_carico),String(r.carico_kg??''),Number(r.ripetizioni),readSetEffort(r.origine).tipo_serie]);
export function buildMuscleCoverage(daily,loads=[],{available=false}={}){
 const groups=Object.fromEntries(GROUPS.map(g=>[g,{planned:0,expected:0,working:0,unclassified:0,secondary:0,checkedProxy:0,checkedExercises:0,missing:0,conflicts:0}]));
 const days=new Map(daily.map(d=>[d.date,d])),records=byIdLatest(loads).filter(r=>days.get(r.data)?.active);
 let unmatched=0,invalid=0,warmups=0,conflicts=0;
 const ledger=new Map(),covered=new Set();
 for(const d of daily)for(const e of d.exercises){if(!isMetric(e))continue;const g=groups[e.muscle];g.planned+=e.sets;if(d.active){g.expected+=e.sets;if(d.checkedIds.some(x=>resolveExercise(x,d.exercises)?.id===e.id)){g.checkedProxy+=e.sets;g.checkedExercises++;}}}
 for(const r of records){
   const d=days.get(r.data),program=r.programma||d.actualProgram||d.program;
   const list=program===d.program?d.exercises:(WORKOUTS[program]||[]);
   const e=resolveExercise(r.esercizio,list.filter(isMetric));
   if(!e){unmatched++;continue;}if(!validSeries(r)){invalid++;continue;}
   const type=readSetEffort(r.origine).tipo_serie;
   if(type==='riscaldamento'){warmups++;continue;}
   const key=JSON.stringify([r.data,program,e.id,Number(r.numero_serie)]);
   if(!ledger.has(key))ledger.set(key,{e,r,signatures:new Set()});
   ledger.get(key).signatures.add(signature(r));
 }
 for(const {e,r,signatures} of ledger.values()){
   const g=groups[e.muscle];
   if(signatures.size!==1){g.conflicts++;conflicts++;continue;}
   const working=readSetEffort(r.origine).tipo_serie==='allenante';
   g[working?'working':'unclassified']++;
   covered.add(JSON.stringify([r.data,e.id]));
   if(working)for(const s of secondary[e.id]||[])if(s!==e.muscle)groups[s].secondary++;
 }
 for(const d of daily){if(!d.active)continue;
   // A completed session without exercise-level evidence is not an observed zero.
   for(const e of d.exercises){if(!isMetric(e))continue;
     const observed=covered.has(JSON.stringify([d.date,e.id]));
     if(!available||((d.actual.done||d.checkedIds.some(x=>resolveExercise(x,d.exercises)?.id===e.id))&&!observed))groups[e.muscle].missing++;
   }
 }
 for(const g of Object.values(groups)){
   g.done=g.working;g.recorded=g.working+g.unclassified;
   g.partial=g.missing>0||g.conflicts>0||g.unclassified>0;
   g.percent=g.planned>0&&(g.working>0||!g.partial&&available)?Math.round(100*g.working/g.planned):null;
   g.recordedPercent=g.planned>0&&g.recorded>0?Math.round(100*g.recorded/g.planned):null;
   g.displayPercent=available&&g.planned>0?(g.recorded>0?Math.round(100*g.recorded/g.planned):g.percent):null;
   g.displayStatus=!available?'unknown':g.planned===0?'none':g.recorded>g.planned?'over':g.recorded===g.planned?'goal':g.recorded>0?'partial':g.percent===null?'unknown':'zero';
   g.status=!available?'unknown':g.working>g.planned?'over':g.planned>0&&g.working===g.planned?'goal':g.working>0?'partial':g.unclassified||g.missing||g.conflicts?'unknown':g.planned?'zero':'none';
 }
 return {groups,available,unmatched,invalid,warmups,conflicts,records:records.length};
}
