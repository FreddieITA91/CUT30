import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {buildPeriodTracker} from '../engine/period-tracker.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const today='2027-06-10',programs=['Upper A','Lower A','Cardio H + core','Upper B','Lower B','Cardio Z','Recupero'];
const programFor=d=>programs[(new Date(d+'T12:00:00Z').getUTCDay()+6)%7];
const targetsFor=()=>({kcal:2000,proteine:160,carboidrati:160,grassi:60,fibre:25});
const tables={Allenamenti:[],Esercizi:[],Misure:[],Nutrizione:[]};
const build=({period})=>buildPeriodTracker({today,period,tables,programFor,targetsFor});
const source=read('experience.js'),css=read('styles.css')+'\n'+read('experience.css');
function dashboard(period){
 const globals={window:{},document:{readyState:'loading',addEventListener(){}},renderDashboard(){},renderProgress(){},renderNutrition(){},render(){},h:String,localDate:()=>today,state:{tables,prefs:{}},isDone:()=>false,programFor,targetsFor,n:Number,cfg:()=>0,buildStub:build,period,dayLabel:d=>d,parseDate:d=>new Date(d+'T12:00:00Z')};
 runInNewContext(source.replace(/\}\)\(\);\s*$/,'trackerEngine={buildPeriodTracker:buildStub};selectedPeriod=period;window.output=fullDashboard();})();'),globals);
 return globals.window.output.replace('<details class="fit-disclosure fit-analytics">','<details class="fit-disclosure fit-analytics" open>');
}
test('analytics contains bounded radar and keyboard-accessible forecast region',()=>{
 const html=dashboard('month');
 assert.match(html,/fit-analytics" open/);
 assert.match(html,/viewBox="0 0 404 340" preserveAspectRatio="xMidYMid meet"/);
 assert.match(html,/class="cx-period-table" role="region"[^>]+tabindex="0"/);
 assert.match(css,/\.cx-page,\.fit-dashboard\{grid-template-columns:minmax\(0,1fr\)\}/);
});
test('Chromium: opening analysis never widens the page or radar at phone and desktop widths',t=>{
 const chrome=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>p&&existsSync(p));
 if(!chrome){t.skip('No Chromium executable available');return;}
 const cases=[320,360,390,430,640,1024].flatMap(width=>['day','week','month'].map(period=>({width,period,html:'<!doctype html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body><div class="shell"><main class="main"><div class="content" id="app">'+dashboard(period)+'</div></main></div></body></html>'})));
 const payload=JSON.stringify(cases).replace(/</g,'\\u003c');
 const html='<!doctype html><meta charset="utf-8"><body><pre id="result">PENDING</pre><script>const cases='+payload+'; const results=[]; for(const c of cases){const f=document.createElement("iframe");f.style.cssText="display:block;border:0;width:"+c.width+"px;height:850px";f.onload=()=>{try{const d=f.contentDocument,w=d.documentElement.clientWidth,card=d.querySelector(".fit-analytics"),svg=card.querySelector(".cx-radar-svg"),wrap=card.querySelector(".cx-period-table"),r=svg.getBoundingClientRect(),cr=card.getBoundingClientRect(),tr=wrap.getBoundingClientRect();results.push({width:c.width,period:c.period,pass:d.documentElement.scrollWidth<=w+1&&card.scrollWidth<=card.clientWidth+1&&r.left>=cr.left-1&&r.right<=cr.right+1&&tr.right<=cr.right+1&&r.width>0&&r.height>0});}catch(e){results.push({width:c.width,period:c.period,error:String(e),pass:false});}if(results.length===cases.length)document.querySelector("#result").textContent=JSON.stringify(results);};f.srcdoc=c.html;document.body.append(f);}</script>';
 const dir=mkdtempSync(join(tmpdir(),'cut30-layout-'));
 try{const path=join(dir,'test.html');writeFileSync(path,html);const p=spawnSync(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--user-data-dir='+join(dir,'profile'),'--virtual-time-budget=5000','--dump-dom','file://'+path],{encoding:'utf8',timeout:45000,maxBuffer:20*1024*1024});
 assert.equal(p.status,0,p.stderr||String(p.error));
 const result=p.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1];assert.ok(result&&result!=='PENDING','Browser did not finish responsive checks');
 const rows=JSON.parse(result);assert.equal(rows.length,cases.length);assert.deepEqual(rows.filter(x=>!x.pass),[]);t.diagnostic('Verified '+rows.length+' viewport/period combinations');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
