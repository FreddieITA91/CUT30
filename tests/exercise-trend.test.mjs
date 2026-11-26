import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseTrend} from '../engine/workout-log.mjs';
import {WORKOUTS} from '../engine/workout-catalog.mjs';
const items=WORKOUTS['Upper B'],ex=items[1];
const row=(date,set,kg,reps,extra={})=>({id:date+'-'+set,data:date,programma:'Upper B',esercizio:ex.name,numero_serie:set,carico_kg:kg,ripetizioni:reps,unita_carico:'kg per mano | palestra A | attrezzo Manubri',...extra});
test('all actual dates, peak kg and total reps; future, other programs and exercises excluded',()=>{const rows=[row('2026-11-01',1,18,10),row('2026-11-01',2,20,8),row('2026-11-26',1,22,10),row('2026-11-27',1,99,99),row('2026-11-26',2,99,99,{programma:'Upper A'}),row('2026-11-26',3,99,99,{esercizio:'Alzate laterali'})];const a=exerciseTrend(ex,rows,'2026-11-26','Upper B',items);assert.deepEqual(a.points.map(p=>[p.date,p.kg,p.reps]),[['2026-11-01',20,18],['2026-11-26',22,10]]);rows.push(row('2026-11-26',2,24,8));assert.deepEqual(exerciseTrend(ex,rows,'2026-11-26','Upper B',items).points.at(-1).reps,18);});
test('conflicting slots excluded and mixed units not silently combined',()=>{const date='2026-11-26',rows=[row(date,1,22,10),row(date,1,24,10,{id:'dup'}),row(date,2,22,10),row(date,3,45,8,{unita_carico:'kg totale'})];const a=exerciseTrend(ex,rows,date,'Upper B',items);assert.equal(a.conflicts,1);assert.equal(a.points[0].kg,null);assert.equal(a.points[0].reps,18);assert.equal(a.points[0].mixed,true);});
