// P0 presentation calculations and deterministic accordion transitions.
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function activityRings(a){
 const m=a.metrics,days=a.daily.filter(d=>d.active);
 const minutesKnown=!days.some(d=>d.hasWorkout&&d.actual.minutes===null);
 const cardioKnown=!days.some(d=>d.hasWorkout&&d.actual.cardio===null);
 const make=(id,label,metric,unit,partial=false)=>({id,label,actual:finite(metric.actual)?metric.actual:null,target:finite(metric.full)?metric.full:null,unit,partial,
   progress:finite(metric.actual)&&finite(metric.full)&&metric.full>0?Math.min(100,Math.round(metric.actual/metric.full*100)):null,
   percent:finite(metric.actual)&&finite(metric.full)&&metric.full>0?Math.round(metric.actual/metric.full*100):null});
 const steps=a.stepDays>0;
 return [make('time','Tempo attivo',m.minutes,'min',!minutesKnown),make('sessions','Sedute',m.sessions,'',false),
   steps?make('steps','Passi',m.steps,'',a.stepDays<a.elapsedDays):make('cardio','Cardio',m.cardio,'min',!cardioKnown)];
}
export function initialOpen(){return null;}
export function nextOpen(items,current,completed){return current===completed?null:current;}
export function toggleOpen(current,id){return current===id?null:id;}
export function sessionMetrics(workout){
 const read=k=>{const v=workout?.[k];return v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<0?null:Number(v);};
 const parts=['durata_pesi_min','durata_cardio_min','durata_core_min'].map(read);
 return {minutes:parts.some(v=>v!==null)?parts.reduce((s,v)=>s+(v??0),0):null,partialMinutes:parts.some(v=>v===null),cardio:read('durata_cardio_min'),kcal:read('kcal_attive')};
}
