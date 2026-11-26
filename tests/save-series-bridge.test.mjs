import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as core from '../engine/cut30.mjs';
import * as log from '../engine/workout-log.mjs';
import * as muscle from '../engine/muscle-coverage.mjs';
import * as flow from '../engine/fitness-p0.mjs';
import {WORKOUTS} from '../engine/workout-catalog.mjs';
const source=readFileSync(new URL('../cut30-engine-bridge.js',import.meta.url),'utf8');
const head=['id','data','programma','esercizio','numero_serie','carico_kg','ripetizioni','unita_carico','origine','updated_at'];
const day='2026-11-26',ex=WORKOUTS['Upper B'].find(e=>e.id==='ub-dbpress');
function fixture(){
 const rows=[head],writes=[],toasts=[],feedback={textContent:'',classList:{toggle(){}}},button={disabled:false,textContent:''};
 const values={esercizio:ex.name,serie:'1',kg:'22',reps:'10',palestra:'B',attrezzo:'Manubri',unita:'kg per mano',tipo_serie:'allenante',rir:'',rpe:''};
 const form={dataset:{wlForm:ex.id,wlDate:day},checkValidity:()=>true,querySelector:q=>q==='[data-wl-feedback]'?feedback:button};
 const state={prefs:{sheetId:'test-only'},tables:{Esercizi:[],Allenamenti:[]}};
 const globals={window:{},document:{readyState:'loading',addEventListener(){},querySelectorAll:()=>[form]},state,selectedDate:day,localDate:()=>day,programFor:()=> 'Upper B',WORKOUTS,core,log,muscle,flow,token:'mock',tokenExpires:Date.now()+9999999,FormData:class{get(k){return values[k]}*[Symbol.iterator](){yield*Object.entries(values)}},googleApi:async(path,method,body)=>{if(method==='POST'){writes.push(body);rows.push(...body.values);return {}}return {values:structuredClone(rows)};},render(){},toast:x=>toasts.push(x),isDone:()=>false,upsert(){},now:()=>new Date().toISOString(),console:{warn(){},error(){}}};
 const injected=source.replace(/\}\)\(\);\s*$/,'engine=core;logEngine=log;muscleEngine=muscle;flowEngine=flow;busy=true;window.api={submitSet,onSubmit,setRows};})();');
 runInNewContext(injected,globals);
 return {rows,writes,values,form,feedback,button,globals,api:globals.window.api};
}
test('new series saves even if optional background refresh busy and no prior load timestamp',async()=>{const x=fixture();await x.api.submitSet(x.form);assert.equal(x.writes.length,1);assert.equal(x.rows[1][5],22);assert.equal(x.rows[1][6],10);assert.equal(x.api.setRows(ex).length,1);x.values.serie='2';await x.api.submitSet(x.form);assert.equal(x.writes.length,2);assert.equal(x.api.setRows(ex).length,2);});
test('repeat submission of same series fails without adding a second record',async()=>{const x=fixture();await x.api.submitSet(x.form);await assert.rejects(x.api.submitSet(x.form),/già presente/);assert.equal(x.writes.length,1);});
test('invalid required field displays inline feedback and does not write',()=>{const x=fixture();x.form.checkValidity=()=>false;x.form.reportValidity=()=>{};x.form.querySelector=q=>q===':invalid'?{validationMessage:'Campo obbligatorio',closest:()=>({textContent:'Attrezzo'}),focus(){}}:q==='[data-wl-feedback]'?x.feedback:x.button;x.api.onSubmit({target:x.form,preventDefault(){},stopImmediatePropagation(){}});assert.match(x.feedback.textContent,/Attrezzo/);assert.equal(x.writes.length,0);});
