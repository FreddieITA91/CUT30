import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORKOUTS} from '../engine/workout-catalog.mjs';
import {buildDailyCycle as cycle,romeDate,cycleRow,planDailyWrite,CYCLE_HEADERS} from '../engine/orchestrator.mjs';
import {makePlanRecord} from '../engine/training-plan.mjs';
const day='2027-06-07';
test('Rome date handles midnight and daylight saving',()=>{
 assert.equal(romeDate(new Date('2027-06-06T22:30:00Z')),day);
 assert.equal(romeDate(new Date('2027-01-01T23:30:00Z')),'2027-01-02');
});
test('server catalog equals PWA catalog exactly',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const src=app.slice(app.indexOf('const WORKOUTS={'),app.indexOf('const ICONS=')).trim();
 const server=readFileSync(new URL('../engine/workout-catalog.mjs',import.meta.url),'utf8');
 assert.ok(server.includes(src.replace('const WORKOUTS=','export const WORKOUTS=')));
 assert.equal(WORKOUTS['Upper A'].length,8);
});
test('empty history creates only a draft, full prescriptions and explicit no audit',()=>{
 const c=cycle({Config:[['chiave','valore'],['data_inizio',day]]},day);
 assert.equal(c.next.status,'bozza_da_confermare');assert.equal(c.next.program,'Upper A');
 assert.equal(c.next.plan.exercises.length,8);assert.equal(c.summary.evaluable,0);
 assert.equal(cycleRow(c,day+'T08:00:00Z').length,CYCLE_HEADERS.length);
});
test('completed day moves draft to following day; no retrospective score without prior plan',()=>{
 const raw={Config:[['chiave','valore'],['data_inizio',day]],Allenamenti:[{id:'w',data:day,programma:'Upper A',stato:'completato',durata_pesi_min:30}]};
 const c=cycle(raw,day);assert.equal(c.next.date,'2027-06-08');assert.equal(c.next.program,'Lower A');
 assert.equal(c.audits[0].rating,null);assert.equal(c.summary.not_evaluable,1);
});
test('confirmed plan preserved and conflicting overrides fail closed',()=>{
 const raw={Config:[['chiave','valore'],['data_inizio',day]]};
 const plan=cycle(raw,day).next.plan;
 const saved=cycle({...raw,SchedeConfermate:[makePlanRecord(plan,day+'T08:00:00Z')]},day);
 assert.equal(saved.next.status,'obiettivo_gia_confermato');assert.deepEqual(saved.next.plan,plan);
 const bad=cycle({...raw,Calendario:[{id:'a',data:day,programma:'Upper A'},{id:'b',data:day,programma:'Lower A'}]},day);
 assert.equal(bad.next.status,'non_disponibile');
});
test('upsert is idempotent, rejects schema and duplicate dates',()=>{
 const h=['date','value'],row=[day,4];
 assert.equal(planDailyWrite([],h,row).rowNumber,2);
 assert.equal(planDailyWrite([h,[day,1]],h,row).rowNumber,2);
 assert.equal(planDailyWrite([h,['2027-06-06',1]],h,row).rowNumber,3);
 assert.throws(()=>planDailyWrite([h,[day,1],[day,2]],h,row),/duplicata/);
 assert.throws(()=>planDailyWrite([['date']],h,row),/Schema/);
});
