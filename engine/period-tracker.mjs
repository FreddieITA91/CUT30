export {buildTrainingLevel} from './training-level.mjs';
import {suggestTrainingDraft,byIdLatest} from './cut30.mjs';
import {readPlanRecord} from './training-plan.mjs';
import {WORKOUTS} from './workout-catalog.mjs';
import {buildMuscleCoverage} from './muscle-coverage.mjs';
import {activityRings} from './fitness-p0.mjs';
const num=v=>v==null||String(v).trim()===''?null:Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const round=v=>Math.round(v*10)/10;
const sum=a=>a.reduce((s,x)=>s+x,0);
const median=a=>{const b=[...a].sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2;};
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const monday=d=>shift(d,-(new Date(d+'T12:00:00Z').getUTCDay()+6)%7);
const dateOK=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&shift(d,0)===d;
export function periodDates(today,period='week'){
 if(!dateOK(today)||!['day','week','month'].includes(period))throw Error('Periodo non valido');
 const start=period==='day'?today:period==='week'?monday(today):today.slice(0,7)+'-01';
 const count=period==='day'?1:period==='week'?7:new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).getUTCDate();
 return Array.from({length:count},(_,i)=>shift(start,i));
}
const ratio=(a,b)=>a===null||b===null||b<=0?null:Math.min(100,Math.max(0,100*a/b));
const metric=(a,t,full=t)=>({actual:a,expected:t,full,score:ratio(a,t)});
const measured=(rows,key)=>{const values=rows.map(r=>num(r[key])).filter(x=>x!==null);return values.length?sum(values):null;};
const keys=['kcal','proteine','carboidrati','grassi','fibre'];
export function buildPeriodTracker({today,period='week',tables={},confirmedPlans=[],loadEvidence=null,programFor,targetsFor,stepsGoal=12000,weeklyCardioGoal=300}){
 const dates=periodDates(today,period),elapsed=dates.filter(d=>d<=today);
 const workouts=byIdLatest(tables.Allenamenti||[]).filter(x=>!['annullato','eliminato'].includes(x.stato)&&dateOK(x.data)&&x.data<=today);
 const byDay=new Map();
 for(const w of workouts){const old=byDay.get(w.data);if(!old||String(w.updated_at||'')>=String(old.updated_at||''))byDay.set(w.data,w);}
 const history=[...byDay.values()].filter(x=>x.stato==='completato');
 const checks=byIdLatest(tables.Esercizi||[]),measures=byIdLatest(tables.Misure||[]).filter(x=>x.contesto!=='eliminato');
 const meals=byIdLatest(tables.Nutrizione||[]).filter(x=>x.qualita!=='eliminato');
 const planCache=new Map();
 function dayPlan(date){
  if(planCache.has(date))return planCache.get(date);
  const saved=confirmedPlans.filter(x=>x.data===date);
  let plan,source='riferimento_corrente';
  if(saved.length===1){try{plan=readPlanRecord(saved[0]);source='confermato';}catch{}}
  if(!plan){const program=programFor(date);const draft=suggestTrainingDraft({},date,{program});plan={program,cardio:draft.cardio,core_minutes:draft.core_minutes,exercises:WORKOUTS[program]||[]};}
  const training=plan.program!=='Recupero',strength=/^(Upper|Lower) /.test(plan.program);
  const past=history.filter(x=>x.data<date&&x.programma===plan.program).sort((a,b)=>a.data.localeCompare(b.data)).slice(-5);
  const wm=past.map(x=>num(x.durata_pesi_min)).filter(x=>x!==null&&x>0);
  const kc=past.map(x=>num(x.kcal_attive)).filter(x=>x!==null&&x>0);
  const ex=strength||plan.program==='Cardio H + core'?plan.exercises:[];
  const d={date,program:plan.program,source,training,cardio:plan.cardio.duration_min,core:plan.core_minutes,
    weights:strength?(wm.length>=2?round(median(wm)):null):0,calorieForecast:training?(kc.length>=2?round(median(kc)):null):0,
    exercises:ex,nutrition:targetsFor(date,plan.program)};
  d.minutes=d.weights===null?null:d.weights+d.cardio+d.core;
  planCache.set(date,d);return d;
 }
 function cardioQuota(date){
  const week=periodDates(date,'week').map(dayPlan),total=sum(week.map(x=>x.cardio));
  return total>0?weeklyCardioGoal*dayPlan(date).cardio/total:null;
 }
 const daily=dates.map(date=>{
  const p=dayPlan(date),active=date<=today,w=active?byDay.get(date):null;
  const actual=w?{minutes:[w.durata_pesi_min,w.durata_cardio_min,w.durata_core_min].some(v=>num(v)!==null)?sum([w.durata_pesi_min,w.durata_cardio_min,w.durata_core_min].map(v=>num(v)||0)):null,
    cardio:num(w.durata_cardio_min),kcal:num(w.kcal_attive),done:w.stato==='completato'}:{minutes:active?0:null,cardio:active?0:null,kcal:active?0:null,done:false};
  const stepValues=active?measures.filter(x=>x.data===date).map(x=>num(x.passi_giornalieri)).filter(x=>x!==null):[];
  const steps=stepValues.length?Math.max(...stepValues):null;
  const checked=new Set(checks.filter(x=>x.data===date&&x.programma===p.program&&String(x.completato).toLowerCase()==='true').map(x=>x.esercizio));
  const nutritionRows=active?meals.filter(x=>x.data===date):[];
  return {...p,active,hasWorkout:!!w,actualProgram:w?.programma||null,actual,steps,cardioGoal:cardioQuota(date),checked:p.exercises.filter(e=>checked.has(e.id)).length,checkedIds:[...checked],
    checklistKnown:checks.some(x=>x.data===date&&x.programma===p.program),
    nutritionActual:Object.fromEntries(keys.map(k=>[k,measured(nutritionRows,k)])),nutritionLogged:nutritionRows.length>0};
 });
 const past=daily.filter(x=>x.active),total=(rows,fn)=>sum(rows.map(fn)),complete=(rows,fn)=>rows.every(x=>fn(x)!==null)?total(rows,fn):null;
 const knownSteps=past.filter(x=>x.steps!==null),knownKcal=past.filter(x=>x.hasWorkout&&x.actual.kcal!==null);
 const calorieActual=past.some(x=>x.hasWorkout)?(knownKcal.length?total(knownKcal,x=>x.actual.kcal):null):0;
 const stepsActual=knownSteps.length?total(knownSteps,x=>x.steps):null;
 const exerciseExpected=total(past,x=>x.exercises.length),exerciseActual=total(past,x=>x.checked);
 const plannedSessions=total(past,x=>Number(x.training)),completed=total(past,x=>Number(x.training&&x.actual.done));
 const minutesExpected=complete(past,x=>x.minutes),minutesActual=total(past,x=>x.actual.minutes||0);
 const cardioActual=total(past,x=>x.actual.cardio||0),cardioExpected=total(past,x=>x.cardio),cardioGoalRaw=complete(daily,x=>x.cardioGoal),quotaRaw=complete(past,x=>x.cardioGoal),cardioGoal=cardioGoalRaw===null?null:round(cardioGoalRaw),quotaToDate=quotaRaw===null?null:round(quotaRaw);
 const metrics={
  steps:metric(stepsActual,stepsGoal*past.length,stepsGoal*daily.length),
  exercises:metric(past.some(x=>x.actual.done&&x.exercises.length&&!x.checklistKnown)&&!exerciseActual?null:exerciseActual,exerciseExpected,total(daily,x=>x.exercises.length)),
  minutes:metric(minutesActual,minutesExpected,complete(daily,x=>x.minutes)),
  cardio:metric(cardioActual,quotaToDate,cardioGoal),
  sessions:metric(completed,plannedSessions,total(daily,x=>Number(x.training)))
 };
 // Missing step observations do not become zero nor count as full-period coverage.
 if(knownSteps.length!==past.length)metrics.steps.score=null;
 if(past.some(x=>x.actual.done&&x.exercises.length&&!x.checklistKnown))metrics.exercises.score=null;
 const incompleteWorkouts=past.some(x=>x.hasWorkout&&(x.actual.minutes===null||x.actual.cardio===null));
 if(incompleteWorkouts){metrics.minutes.score=null;metrics.cardio.score=null;}
 const muscleEvidence=buildMuscleCoverage(daily,loadEvidence?.rows??tables.Carichi??[],{available:loadEvidence?.available??Array.isArray(tables.Carichi)});
 const muscles=muscleEvidence.groups;
 const scores=Object.values(metrics).map(m=>m.score).filter(x=>x!==null);
 const nutrition=Object.fromEntries(keys.map(k=>[k,{actual:measured(past.map(x=>x.nutritionActual),k),
    expected:complete(past,x=>num(x.nutrition[k])),full:complete(daily,x=>num(x.nutrition[k]))}]));
 const result={period,today,muscles,muscleEvidence,start:dates[0],end:dates.at(-1),daily,elapsedDays:past.length,metrics,index:scores.length?Math.round(sum(scores)/scores.length):null,coverage:scores.length,
   cardioPlanned:total(daily,x=>x.cardio),cardioPlannedToDate:cardioExpected,cardioGap:cardioGoal===null?null:round(cardioGoal-total(daily,x=>x.cardio)),
   calories:{actual:calorieActual,forecast:complete(daily,x=>x.calorieForecast),forecastToDate:complete(past,x=>x.calorieForecast),recordedSessions:knownKcal.length,partial:past.some(x=>x.hasWorkout&&x.actual.kcal===null)},
   nutrition,nutritionDays:past.filter(x=>x.nutritionLogged).length,stepDays:knownSteps.length};
 result.rings=activityRings(result);return result;
}
