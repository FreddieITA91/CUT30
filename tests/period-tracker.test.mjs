import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPeriodTracker as build,periodDates} from '../engine/period-tracker.mjs';
import {makePlanRecord} from '../engine/training-plan.mjs';
const today='2027-06-10',week=['Upper A','Lower A','Cardio H + core','Upper B','Lower B','Cardio Z','Recupero'];
const programFor=d=>week[(new Date(d+'T12:00:00Z').getUTCDay()+6)%7];
const targetsFor=d=>({kcal:programFor(d)==='Recupero'?1800:2000,proteine:160,carboidrati:160,grassi:60,fibre:25});
const workout=(date,kcal,cardio,program=programFor(date))=>({id:date,data:date,programma:program,stato:'completato',kcal_attive:kcal,durata_cardio_min:cardio,durata_pesi_min:60});
const tables={Allenamenti:[workout('2027-06-08',860,17),workout('2027-06-09',564,48),workout('2027-06-11',999,90)]};
const args={today,tables,programFor,targetsFor};
test('default week sums only recorded sessions; today has zero recorded calories',()=>{
 const a=build(args),d=build({...args,period:'day'});
 assert.equal(a.period,'week');assert.equal(a.calories.actual,1424);assert.equal(d.calories.actual,0);
 assert.equal(d.metrics.sessions.actual,0);assert.equal(a.metrics.cardio.actual,65);assert.equal(a.metrics.cardio.full,300);assert.equal(a.cardioPlanned,220);assert.equal(a.cardioGap,80);
 assert.equal(a.metrics.sessions.full,6);assert.equal(a.metrics.sessions.expected,4);assert.equal(a.metrics.steps.score,null);
});
test('future entries excluded and month bounds correct',()=>{
 const a=build({...args,period:'month'});assert.equal(a.start,'2027-06-01');assert.equal(a.end,'2027-06-30');assert.equal(a.daily.length,30);assert.equal(a.calories.actual,1424);assert.equal(periodDates('2028-02-15','month').length,29);
});
test('forecasts need two prior comparable completed sessions, never later sessions',()=>{
 const a=build({...args,period:'day',tables:{Allenamenti:[...tables.Allenamenti,workout('2027-05-27',400,25,'Upper B'),workout('2027-06-03',600,25,'Upper B')]}});
 assert.equal(a.calories.forecast,500);assert.equal(a.calories.actual,0);assert.equal(a.metrics.minutes.expected,85);
});
test('confirmed plan wins; missing measured calories remain missing',()=>{
 const plan={schema_version:'1.0',date:today,program:'Upper B',cardio:{duration_min:35,phases:[]},core_minutes:0,exercises:[]};
 const a=build({...args,period:'day',confirmedPlans:[makePlanRecord(plan,today+'T08:00:00Z')],tables:{Allenamenti:[workout(today,null,15)]}});
 assert.equal(a.cardioPlanned,35);assert.equal(a.calories.actual,null);assert.equal(a.calories.partial,true);assert.equal(a.daily[0].source,'confermato');
});
test('nutrition totals use each day type and unknown nutrition stays unknown',()=>{
 const a=build(args);assert.equal(a.nutrition.kcal.actual,null);assert.equal(a.nutrition.kcal.expected,8000);assert.equal(a.nutrition.kcal.full,13800);
});

test('dashboard rendering does not reference the obsolete calorie or radar properties',async()=>{
 const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../experience.js',import.meta.url),'utf8');
 const a=build(args),daily=build({...args,period:'day'});
 const globals={window:{},document:{readyState:'loading',addEventListener(){}},renderDashboard(){},renderProgress(){},renderNutrition(){},render(){},h:String,localDate:()=>today,state:{tables},programFor,targetsFor,n:Number,cfg:()=>0,buildStub:({period})=>period==='day'?daily:a,example:a,dayLabel:d=>d,parseDate:d=>new Date(d+'T12:00:00Z')};
 const injected=source.replace(/\}\)\(\);\s*$/, 'trackerEngine={buildPeriodTracker:buildStub};window.output=[radarCard(example),periodSelector(example),dailyPlanCard(example),cards(example),weekCard(example),muscleSummary(example)];})();');
 runInNewContext(injected,globals);
 assert.equal(globals.window.output.length,6);
 assert.match(globals.window.output[0],/Esercizi confermati/);
 assert.match(globals.window.output[1],/aria-pressed="true"[^>]*>Settimana/);
 assert.match(globals.window.output[3],/Calorie attive oggi/);
 assert.match(globals.window.output[3],/Nessun allenamento registrato oggi/);
 assert.ok(!source.includes('a.values[i]'));
});
