import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestTrainingDraft} from '../engine/cut30.mjs';
import {buildTrainingPlan as build,canConfirmPlan as can,makePlanRecord,readPlanRecord,PLAN_HEADERS} from '../engine/training-plan.mjs';
const date='2027-04-07', exercises=[{id:'plank',name:'Plank',dose:'3 × 40–60 sec',rest:'45 sec',sets:3,muscle:'Core'}];
const draft=()=>suggestTrainingDraft({},date,{program:'Cardio H + core'});
test('full plan captures core, doses, rest and every cardio phase without mutating inputs',()=>{
 const d=draft(),p=build(d,exercises,{actions:[{text:'test guidance'}]});
 assert.equal(p.core_minutes,15);assert.equal(p.cardio.duration_min,55);assert.equal(p.cardio.phases.length,5);
 assert.equal(p.exercises[0].dose,exercises[0].dose);assert.equal(p.guidance[0],'test guidance');
 d.cardio.phases[0].duration_min=99;assert.equal(p.cardio.phases[0].duration_min,5);
});
test('prospective only, rejects existing plan and actual evidence',()=>{
 const p=build(draft(),exercises);assert.equal(can(p,date).ok,true);assert.equal(can(p,'2027-04-08').ok,false);
 for(const evidence of [{plans:[{data:date}]},{workouts:[{data:date,stato:'in_corso',durata_cardio_min:10}]},{calendar:[{data:date,stato:'completato'}]},{exercises:[{data:date,completato:true}]},{loads:[{data:date}]},{segments:[{data:date}]}])assert.equal(can(p,date,evidence).ok,false);
 assert.equal(can(p,date,{workouts:[{data:date,stato:'in_corso'}]}).ok,true);
});
test('snapshot record has stable schema and round trips without changing original plan',()=>{
 const p=build(draft(),exercises),r=makePlanRecord(p,'2027-04-07T08:00:00Z');
 assert.deepEqual(Object.keys(r),PLAN_HEADERS);assert.deepEqual(readPlanRecord(r),p);assert.throws(()=>readPlanRecord({...r,programma:'Upper A'}),/incoerente/);
});
test('reject incomplete strength/core plans and inconsistent cardio',()=>{
 const d=draft();assert.throws(()=>build(d,[]),/core/);
 assert.throws(()=>build({...d,cardio:{...d.cardio,duration_min:5}},exercises),/Durate/);
 assert.throws(()=>build({...d,status:'giornata_gia_conclusa'},exercises),/conclusa/);
 assert.throws(()=>build(suggestTrainingDraft({},date,{program:'Upper A'}),[]),/pesi/);
});
test('rest plan never invents cardio targets',()=>{
 const p=build(suggestTrainingDraft({},date,{program:'Recupero'}),[]);
 assert.equal(p.cardio.duration_min,0);assert.equal(p.cardio.target_average_hr_bpm,null);
});
