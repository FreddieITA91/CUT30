import test from 'node:test';
import assert from 'node:assert/strict';
import {activityRings,initialOpen,nextOpen,toggleOpen,sessionMetrics} from '../engine/fitness-p0.mjs';
const metric=(actual,full)=>({actual,full});
const base={daily:[{active:true,hasWorkout:true,actual:{minutes:80,cardio:20}}],stepDays:0,elapsedDays:4,metrics:{minutes:metric(80,300),sessions:metric(2,6),steps:metric(null,84000),cardio:metric(20,300)}};
test('rings use whole-period targets, cardio fallback only without steps',()=>{const r=activityRings(base);assert.deepEqual(r.map(x=>x.id),['time','sessions','cardio']);assert.equal(r[0].percent,27);assert.equal(r[1].percent,33);assert.equal(r[2].target,300);});
test('steps partial, no invented target for rest or missing plan',()=>{const r=activityRings({...base,stepDays:1,metrics:{...base.metrics,steps:metric(10000,84000),minutes:metric(0,null),sessions:metric(0,0)}});assert.equal(r[2].id,'steps');assert.equal(r[2].partial,true);assert.equal(r[0].percent,null);assert.equal(r[1].percent,null);});
test('all collapsed initially; completion closes only selected exercise',()=>{const list=[{id:'a',done:true},{id:'b',done:false},{id:'c',done:false}];assert.equal(initialOpen(list),null);assert.equal(nextOpen(list.map(x=>x.id==='b'?{...x,done:true}:x),'b','b'),null);assert.equal(nextOpen(list,'c','b'),'c');assert.equal(nextOpen(list.map(x=>({...x,done:true})),'c','c'),null);assert.equal(toggleOpen('c','c'),null);assert.equal(toggleOpen(null,'a'),'a');});
test('summary excludes unrecorded minutes and calories, preserves measured zero',()=>{assert.deepEqual(sessionMetrics({durata_pesi_min:60,durata_cardio_min:0,kcal_attive:''}),{minutes:60,partialMinutes:true,cardio:0,kcal:null});assert.equal(sessionMetrics(null).minutes,null);});
