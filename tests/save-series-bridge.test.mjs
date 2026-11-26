import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
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
 const globals={window:{},document:{readyState:'loading',addEventListener(){},querySelectorAll:()=>[form]},h:String,state,currentPage:'training',selectedDate:day,localDate:()=>day,programFor:()=> 'Upper B',WORKOUTS,core,log,muscle,flow,token:'mock',tokenExpires:Date.now()+9999999,FormData:class{get(k){return values[k]}*[Symbol.iterator](){yield*Object.entries(values)}},googleApi:async(path,method,body)=>{if(method==='POST'){writes.push(body);rows.push(...body.values);return {}}return {values:structuredClone(rows)};},render(){},toast:x=>toasts.push(x),isDone:()=>false,upsert(){},now:()=>new Date().toISOString(),console:{warn(){},error(){}}};
 const injected=source.replace(/\}\)\(\);\s*$/,'engine=core;logEngine=log;muscleEngine=muscle;flowEngine=flow;busy=true;window.api={submitSet,onSubmit,setRows,priorRows,isExerciseOpen,toggleExercise,collapseCompleted,exerciseRow};})();');
 runInNewContext(injected,globals);
 return {rows,writes,values,form,feedback,button,globals,api:globals.window.api};
}
test('new series saves even if optional background refresh busy and no prior load timestamp',async()=>{const x=fixture();await x.api.submitSet(x.form);assert.equal(x.writes.length,1);assert.equal(x.rows[1][5],22);assert.equal(x.rows[1][6],10);assert.equal(x.api.setRows(ex).length,1);x.values.serie='2';await x.api.submitSet(x.form);assert.equal(x.writes.length,2);assert.equal(x.api.setRows(ex).length,2);});
test('repeat submission of same series fails without adding a second record',async()=>{const x=fixture();await x.api.submitSet(x.form);await assert.rejects(x.api.submitSet(x.form),/già presente/);assert.equal(x.writes.length,1);});
test('invalid required field displays inline feedback and does not write',()=>{const x=fixture();x.form.checkValidity=()=>false;x.form.reportValidity=()=>{};x.form.querySelector=q=>q===':invalid'?{validationMessage:'Campo obbligatorio',closest:()=>({textContent:'Attrezzo'}),focus(){}}:q==='[data-wl-feedback]'?x.feedback:x.button;x.api.onSubmit({target:x.form,preventDefault(){},stopImmediatePropagation(){}});assert.match(x.feedback.textContent,/Attrezzo/);assert.equal(x.writes.length,0);});

test('optional equipment saves and counts a real set, never promotes unknown equipment to a comparable reference',async()=>{const x=fixture();x.values.attrezzo='';await x.api.submitSet(x.form);assert.match(x.rows[1][7],/attrezzo non identificato$/);assert.equal(log.sessionWorkingCount(x.api.setRows(ex),core.readSetEffort),1);assert.equal(x.writes.length,1);});
test('historical and other-program rows never enter the selected session',async()=>{const x=fixture();const old=['old','2026-11-19','Upper B',ex.name,1,18,10,'kg per mano','',day];const other=['other',day,'Upper A',ex.name,1,18,10,'kg per mano','',day];x.rows.push(old,other);await x.api.submitSet(x.form);assert.deepEqual(x.api.setRows(ex).map(x=>x.id),[x.rows[3][0]]);assert.equal(x.api.priorRows(ex)[0].id,'old');assert.equal(x.writes.length,1);});
test('aliases and equipment changes cannot create a second row for an occupied series slot',async()=>{const x=fixture();x.rows.push(['old-alias',day,'Upper B','Panca piana con manubri',1,18,10,'kg per mano','',day]);x.values.attrezzo='Altro';await assert.rejects(x.api.submitSet(x.form),/già presente/);assert.equal(x.writes.length,0);});



test('actual exercise markup starts closed, stays open across rendering and intermediate saves, closes on last working set',async()=>{
 const x=fixture(),items=WORKOUTS['Upper B'],other=items[2];
 const html=e=>x.api.exerciseRow(e,0,items);
 for(const e of items){assert.match(html(e),/aria-expanded="false"/);assert.match(html(e),/hidden inert style="display:none!important"/);}
 x.api.toggleExercise(day,ex.id);assert.match(html(ex),/aria-expanded="true"/);assert.doesNotMatch(html(ex),/class="wl-expand" hidden/);
 x.api.toggleExercise(day,other.id);assert.match(html(ex),/aria-expanded="true"/);assert.match(html(other),/aria-expanded="true"/);
 for(let i=1;i<=ex.sets;i++){x.values.serie=String(i);await x.api.submitSet(x.form);assert.equal(x.api.isExerciseOpen(day,ex.id),i<ex.sets);assert.match(html(other),/aria-expanded="true"/);}
 assert.match(html(ex),/aria-expanded="false"/);assert.equal(x.writes.length,ex.sets);
 x.api.toggleExercise(day,other.id);assert.match(html(other),/aria-expanded="false"/);
});
test('opening is isolated by diary, date and program, never persisted across fresh app instances',()=>{
 const x=fixture(),items=WORKOUTS['Upper B'];x.api.toggleExercise(day,ex.id);
 assert.equal(x.api.isExerciseOpen(day,ex.id),true);assert.equal(x.api.isExerciseOpen('2026-11-19',ex.id),false);
 x.globals.state.prefs.sheetId='other';assert.equal(x.api.isExerciseOpen(day,ex.id),false);
 assert.equal(fixture().api.isExerciseOpen(day,ex.id),false);
});

test('live chart and side-by-side comparison update after each actual verified set',async()=>{const x=fixture(),items=WORKOUTS['Upper B'];x.rows.push(['historic','2026-11-19','Upper B',ex.name,1,18,8,'kg per mano | palestra B | attrezzo Manubri','',day]);x.api.toggleExercise(day,ex.id);await x.api.submitSet(x.form);let html=x.api.exerciseRow(ex,0,items);assert.match(html,/data-trend-points="2"/);assert.match(html,/Ripetizioni totali <b>10/);assert.match(html,/Ultima seduta/);assert.match(html,/Questa seduta/);assert.ok(html.indexOf('wl-trend')<html.indexOf('wl-session-compare'));x.values.serie='2';x.values.kg='24';x.values.reps='8';await x.api.submitSet(x.form);html=x.api.exerciseRow(ex,0,items);assert.match(html,/Carico max <b>24 kg/);assert.match(html,/Ripetizioni totali <b>18/);assert.match(html,/2026-11-19 → 2026-11-26/);});

test('Chromium: exercise chart and both session columns fit on narrow phone widths',async t=>{
 const chrome=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>p&&existsSync(p));
 if(!chrome){t.skip('No Chromium executable available');return;}
 const x=fixture(),items=WORKOUTS['Upper B'];
 x.rows.push(['historic','2026-11-19','Upper B',ex.name,1,18,8,'kg per mano | palestra B | attrezzo Manubri','',day]);
 x.api.toggleExercise(day,ex.id);await x.api.submitSet(x.form);
 const css=['styles.css','experience.css'].map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')).join('\n');
 const inner='<style>'+css+'</style><div class="shell"><main class="main"><div class="content" id="app"><section class="panel wl-shell">'+x.api.exerciseRow(ex,0,items)+x.api.exerciseRow(items[2],1,items)+'</section></div></main></div>';
 const payload=JSON.stringify(inner).replace(/</g,'\\u003c');
 const doc='<!doctype html><meta charset="utf-8"><body><pre id="result">PENDING</pre><script>const content='+payload+';const results=[];const widths=[320,360,390,430,640,1024];for(const width of widths){const f=document.createElement("iframe");f.style.cssText="display:block;border:0;width:"+width+"px;height:850px";f.onload=()=>{try{const d=f.contentDocument,w=d.documentElement.clientWidth,card=d.querySelector(".wl-shell"),chart=d.querySelector(".wl-trend-svg"),past=d.querySelector(".wl-compare-past"),now=d.querySelector(".wl-compare-now"),a=past.getBoundingClientRect(),b=now.getBoundingClientRect(),r=chart.getBoundingClientRect(),c=card.getBoundingClientRect();results.push({width,pass:d.documentElement.scrollWidth<=w+1&&card.scrollWidth<=card.clientWidth+1&&a.width>0&&b.width>0&&Math.abs(a.top-b.top)<2&&a.right<=b.left+1&&b.right<=c.right+1&&r.left>=c.left-1&&r.right<=c.right+1&&r.height>0&&d.querySelector("[data-wl-open=false]>.wl-expand").getBoundingClientRect().height===0});}catch(e){results.push({width,pass:false,error:String(e)});}if(results.length===widths.length)document.querySelector("#result").textContent=JSON.stringify(results);};f.srcdoc="<!doctype html><meta charset=utf-8>"+content;document.body.append(f);}</script>';
 const dir=mkdtempSync(join(tmpdir(),'cut30-training-layout-'));try{const path=join(dir,'test.html');writeFileSync(path,doc);const p=spawnSync(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--user-data-dir='+join(dir,'profile'),'--virtual-time-budget=5000','--dump-dom','file://'+path],{encoding:'utf8',timeout:45000,maxBuffer:20*1024*1024});assert.equal(p.status,0,p.stderr||String(p.error));const result=p.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1];assert.ok(result&&result!=='PENDING');const rows=JSON.parse(result);assert.equal(rows.length,6);assert.deepEqual(rows.filter(x=>!x.pass),[]);t.diagnostic('Verified side-by-side training layout at six viewport widths');}finally{rmSync(dir,{recursive:true,force:true});}
});
