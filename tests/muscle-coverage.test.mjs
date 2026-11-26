import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMuscleCoverage as build} from '../engine/muscle-coverage.mjs';
import {encodeSetEffort} from '../engine/cut30.mjs';
import {WORKOUTS} from '../engine/workout-catalog.mjs';
const date='2026-11-26',exercises=WORKOUTS['Upper A'],d={date,active:true,program:'Upper A',actual:{done:false},checkedIds:[],exercises};
const row=(i,name='Panca piana',type='allenante',extra={})=>({id:'s'+i,data:date,programma:'Upper A',esercizio:name,numero_serie:i,carico_kg:30,ripetizioni:8,unita_carico:'kg totale',origine:encodeSetEffort('',{tipo_serie:type}),...extra});
test('actual series increment before checklist completion; targets use entire period',()=>{const a=build([d,{...d,date:'2026-11-27',active:false}],[row(1),row(2),row(3,'Panca piana','riscaldamento')],{available:true});assert.equal(a.groups.Petto.working,2);assert.equal(a.groups.Petto.planned,14);assert.equal(a.groups.Petto.expected,7);assert.equal(a.groups.Petto.percent,14);assert.equal(a.groups.Braccia.secondary,2);assert.equal(a.warmups,1);});
test('no loaded detail means N/D rather than zero; completed/checklist alone does not invent sets',()=>{const a=build([{...d,actual:{done:true},checkedIds:['bench']}],[],{available:true});assert.equal(a.groups.Petto.percent,null);assert.equal(a.groups.Petto.checkedProxy,4);assert.equal(a.groups.Petto.working,0);assert.equal(a.groups.Petto.status,'unknown');assert.equal(build([d],[],{available:false}).groups.Petto.percent,null);assert.equal(build([d],[],{available:true}).groups.Petto.percent,0);});
test('legacy and indirect involvement are separate, never credited as working sets',()=>{const a=build([d],[row(1,'bench press','non_specificata'),row(2,'Panca piana','allenante')],{available:true});assert.equal(a.groups.Petto.working,1);assert.equal(a.groups.Petto.unclassified,1);assert.equal(a.groups.Petto.recordedPercent,29);assert.equal(a.groups.Petto.percent,14);assert.equal(a.groups.Spalle.secondary,1);assert.equal(a.groups.Spalle.working,0);});
test('extra volume is not capped; duplicate IDs or conflicting logical series do not inflate count',()=>{const rows=Array.from({length:8},(_,i)=>row(i+1));rows.push({...rows[0],id:'duplicate'},row(9,'unmapped'));let a=build([d],rows,{available:true});assert.equal(a.groups.Petto.working,8);assert.equal(a.groups.Petto.status,'over');assert.equal(a.groups.Petto.percent,114);assert.equal(a.unmatched,1);a=build([d],[row(1),row(1,'Panca piana','allenante',{id:'other',ripetizioni:9})],{available:true});assert.equal(a.groups.Petto.working,0);assert.equal(a.conflicts,1);});
test('past actual program may differ from planned, future loads excluded',()=>{const a=build([{...d,actualProgram:'Lower A'},{...d,date:'2026-11-27',active:false}],[row(1,'Stacco rumeno','allenante',{programma:'Lower A'}),row(2,'Panca piana','allenante',{data:'2026-11-27'})],{available:true});assert.equal(a.groups.Posteriori.working,1);assert.equal(a.groups.Petto.working,0);});

test('historical named checks and unclassified loads show recorded coverage, not verified effort',()=>{
 const date='2026-11-24',day={date,active:true,program:'Lower A',actual:{done:true},checkedIds:['Leg press','Stacco rumeno','Bulgarian split squat','Leg curl','Calf raise','Cable crunch'],exercises:WORKOUTS['Lower A']};
 const friday={...day,date:'2026-11-27',active:false,program:'Lower B',checkedIds:[],exercises:WORKOUTS['Lower B']};
 const rows=[...Array.from({length:4},(_,i)=>row(i+1,'Leg press','non_specificata',{id:'leg'+i,data:date,programma:'Lower A'})),...Array.from({length:3},(_,i)=>row(i+1,'Stacco rumeno','non_specificata',{id:'rdl'+i,data:date,programma:'Lower A'}))];
 const a=build([day,friday],rows,{available:true});
 assert.equal(a.groups.Quadricipiti.recorded,4);assert.equal(a.groups.Quadricipiti.displayPercent,29);assert.equal(a.groups.Quadricipiti.percent,null);assert.equal(a.groups.Quadricipiti.checkedExercises,2);
 assert.equal(a.groups.Posteriori.displayPercent,21);assert.equal(a.groups.Posteriori.working,0);assert.equal(a.groups.Polpacci.displayPercent,null);
});
