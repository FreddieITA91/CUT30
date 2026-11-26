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
 const globals={window:{},document:{readyState:'loading',addEventListener(){},querySelectorAll:()=>[form]},state,currentPage:'training',selectedDate:day,localDate:()=>day,programFor:()=> 'Upper B',WORKOUTS,core,log,muscle,flow,token:'mock',tokenExpires:Date.now()+9999999,FormData:class{get(k){return values[k]}*[Symbol.iterator](){yield*Object.entries(values)}},googleApi:async(path,method,body)=>{if(method==='POST'){writes.push(body);rows.push(...body.values);return {}}return {values:structuredClone(rows)};},render(){},toast:x=>toasts.push(x),isDone:()=>false,upsert(){},now:()=>new Date().toISOString(),console:{warn(){},error(){}}};
 const injected=source.replace(/\}\)\(\);\s*$/,'engine=core;logEngine=log;muscleEngine=muscle;flowEngine=flow;busy=true;window.api={submitSet,onSubmit,setRows,priorRows,currentOpen,setOpen,collapseCompleted};})();');
 runInNewContext(injected,globals);
 return {rows,writes,values,form,feedback,button,globals,api:globals.window.api};
}
test('new series saves even if optional background refresh busy and no prior load timestamp',async()=>{const x=fixture();await x.api.submitSet(x.form);assert.equal(x.writes.length,1);assert.equal(x.rows[1][5],22);assert.equal(x.rows[1][6],10);assert.equal(x.api.setRows(ex).length,1);x.values.serie='2';await x.api.submitSet(x.form);assert.equal(x.writes.length,2);assert.equal(x.api.setRows(ex).length,2);});
test('repeat submission of same series fails without adding a second record',async()=>{const x=fixture();await x.api.submitSet(x.form);await assert.rejects(x.api.submitSet(x.form),/già presente/);assert.equal(x.writes.length,1);});
test('invalid required field displays inline feedback and does not write',()=>{const x=fixture();x.form.checkValidity=()=>false;x.form.reportValidity=()=>{};x.form.querySelector=q=>q===':invalid'?{validationMessage:'Campo obbligatorio',closest:()=>({textContent:'Attrezzo'}),focus(){}}:q==='[data-wl-feedback]'?x.feedback:x.button;x.api.onSubmit({target:x.form,preventDefault(){},stopImmediatePropagation(){}});assert.match(x.feedback.textContent,/Attrezzo/);assert.equal(x.writes.length,0);});

test('optional equipment saves and counts a real set, never promotes unknown equipment to a comparable reference',async()=>{const x=fixture();x.values.attrezzo='';await x.api.submitSet(x.form);assert.match(x.rows[1][7],/attrezzo non identificato$/);assert.equal(log.sessionWorkingCount(x.api.setRows(ex),core.readSetEffort),1);assert.equal(x.writes.length,1);});
test('historical and other-program rows never enter the selected session',async()=>{const x=fixture();const old=['old','2026-11-19','Upper B',ex.name,1,18,10,'kg per mano','',day];const other=['other',day,'Upper A',ex.name,1,18,10,'kg per mano','',day];x.rows.push(old,other);await x.api.submitSet(x.form);assert.deepEqual(x.api.setRows(ex).map(x=>x.id),[x.rows[3][0]]);assert.equal(x.api.priorRows(ex)[0].id,'old');assert.equal(x.writes.length,1);});
test('aliases and equipment changes cannot create a second row for an occupied series slot',async()=>{const x=fixture();x.rows.push(['old-alias',day,'Upper B','Panca piana con manubri',1,18,10,'kg per mano','',day]);x.values.attrezzo='Altro';await assert.rejects(x.api.submitSet(x.form),/già presente/);assert.equal(x.writes.length,0);});

test('exercise rows start closed, last verified working set closes only the manually opened exercise',async()=>{const x=fixture();assert.equal(x.api.currentOpen(),null);x.api.setOpen(day,ex.id);assert.equal(x.api.currentOpen(),ex.id);for(let i=1;i<=ex.sets;i++){x.values.serie=String(i);await x.api.submitSet(x.form);assert.equal(x.api.currentOpen(),i===ex.sets?null:ex.id);}assert.equal(x.writes.length,ex.sets);x.api.setOpen(day,'ub-cablerow');assert.equal(x.api.collapseCompleted(day,ex.id),false);assert.equal(x.api.currentOpen(),'ub-cablerow');});
