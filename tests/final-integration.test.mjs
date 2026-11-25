import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publishDailyCycle,activationConfig} from '../engine/publish-report.mjs';
import {TABLE_HEADERS} from '../engine/cut30.mjs';
const day='2027-06-07',at=day+'T07:20:00Z';
const source=()=>new Map([['Config',[['chiave','valore'],['data_inizio',day]]],...Object.entries(TABLE_HEADERS).map(([k,v])=>[k,[v]]),['Calendario',[['id','data','programma','stato','note','updated_at']]]]);
function transport(tables,{corrupt=false}={}){
 const writes=[];
 const api=async(url,options={})=>{
   const method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
   const u=new URL(url);
   if(u.searchParams.get('fields'))return {sheets:[...tables.keys()].map(title=>({properties:{title}}))};
   if(u.pathname.endsWith('/values:batchGet'))return {valueRanges:u.searchParams.getAll('ranges').map(range=>{const title=range.match(/^'([^']+)'!/)[1];assert.ok(tables.has(title));return {values:structuredClone(tables.get(title))};})};
   if(u.pathname.endsWith(':batchUpdate')){
     for(const req of body.requests){const title=req.addSheet.properties.title;assert.ok(!tables.has(title));tables.set(title,[]);writes.push(title);}
     return {};
   }
   const range=decodeURIComponent(u.pathname.split('/values/')[1]||'');
   const m=range.match(/^'([^']+)'!A(\d*)\:[A-Z]+\d*(:append)?$/);
   assert.ok(m,range);
   const title=m[1];assert.ok(tables.has(title));
   const rows=tables.get(title);
   if(method==='GET')return {values:structuredClone(rows)};
   writes.push(title);
   assert.ok(['AnalisiAuto','CicloAuto'].includes(title),'source write forbidden');
   if(method==='POST'){assert.ok(m[3]);rows.push(...structuredClone(body.values));}
   else{assert.equal(method,'PUT');rows[Number(m[2])-1]=structuredClone(body.values[0]);}
   if(corrupt&&title==='CicloAuto'&&rows.length>1)rows[1][4]='CORRUPTED';
   return {};
 };
 return {api,writes};
}
test('daily publisher end-to-end via strict mock: creates outputs, verifies and reruns idempotently',async()=>{
 const t=source(),original=structuredClone([...t]),{api,writes}=transport(t);
 const r=await publishDailyCycle(api,'https://mock.invalid/sheet',day,at);
 assert.equal(r.status,'verified');assert.equal(t.get('AnalisiAuto').length,2);assert.equal(t.get('CicloAuto').length,2);
 const c=JSON.parse(t.get('CicloAuto')[1][8]);assert.equal(c.next.program,'Upper A');assert.equal(c.next.plan.exercises.length,8);
 await publishDailyCycle(api,'https://mock.invalid/sheet',day,day+'T08:20:00Z');
 assert.equal(t.get('AnalisiAuto').length,2);assert.equal(t.get('CicloAuto').length,2);
 assert.deepEqual([...t].slice(0,original.length),original);assert.ok(writes.every(x=>['AnalisiAuto','CicloAuto'].includes(x)));
});
test('publisher rejects wrong schema before any write',async()=>{
 const t=source();t.set('CicloAuto',[['wrong']]);const {api,writes}=transport(t);
 await assert.rejects(publishDailyCycle(api,'https://mock.invalid/sheet',day,at),/Schema/);assert.deepEqual(writes,[]);
});
test('publisher detects post-write corruption rather than declaring success',async()=>{
 const t=source(),{api}=transport(t,{corrupt:true});await assert.rejects(publishDailyCycle(api,'https://mock.invalid/sheet',day,at),/verification failed/);
});
test('PWA avoids oversized hardcoded reads and requires unique saved IDs',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8'),bridge=readFileSync(new URL('../cut30-engine-bridge.js',import.meta.url),'utf8');
 assert.ok(!app.includes('A1:O2000'));assert.ok(!bridge.includes('A1:P4000'));
 assert.ok(bridge.includes("Carichi:'J'"));assert.ok(bridge.includes('verified.length!==1'));
});

test('OIDC read-only acceptance checks inputs and writes nothing',async()=>{
 const t=source(),{api,writes}=transport(t);
 const r=await publishDailyCycle(api,'https://mock.invalid/sheet',day,at,{dryRun:true});
 assert.equal(r.status,'read_verified');assert.deepEqual(writes,[]);assert.equal(t.has('CicloAuto'),false);
});
test('activation fails closed without short-lived credentials and rejects unexpected mode',()=>{
 assert.throws(()=>activationConfig({}),/missing/);
 assert.throws(()=>activationConfig({CUT30_GOOGLE_SERVICE_ACCOUNT_JSON:'legacy',CUT30_SPREADSHEET_ID:'fake'}),/missing/);
 assert.throws(()=>activationConfig({CUT30_GOOGLE_ACCESS_TOKEN:'synthetic',CUT30_SPREADSHEET_ID:'fake',CUT30_MODE:'unknown'}),/Invalid mode/);
 assert.equal(activationConfig({CUT30_GOOGLE_ACCESS_TOKEN:'synthetic',CUT30_SPREADSHEET_ID:'fake'}).mode,'publish');
});
