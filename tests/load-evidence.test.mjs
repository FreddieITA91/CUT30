import test from 'node:test';
import assert from 'node:assert/strict';
import {readLoads,parseLoads,LOAD_HEADERS} from '../engine/load-evidence.mjs';
test('loads require only Carichi; unrelated tabs are not requested',async()=>{
 const calls=[];const rows=await readLoads(async path=>{calls.push(path);return {values:[LOAD_HEADERS,['id','2026-11-24','Lower A','Leg press',1,100,8,'kg macchina','confirmed','']]};});
 assert.equal(calls.length,1);assert.match(decodeURIComponent(calls[0]),/Carichi/);assert.equal(rows[0].ripetizioni,8);
});
test('read failures surface; header-only is valid empty history',async()=>{
 await assert.rejects(readLoads(async()=>{throw Error('401');}),/401/);
 assert.throws(()=>parseLoads([['wrong']]),/Intestazioni/);
 assert.deepEqual(parseLoads([LOAD_HEADERS]),[]);
});
