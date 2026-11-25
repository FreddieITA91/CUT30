import test from 'node:test';
import assert from 'node:assert/strict';
import {planDeltaSync} from '../engine/sync-delta.mjs';

const header=['id','data','stato','updated_at'];
const cloud=[header,
  ['session1','2026-11-21','completato','2026-11-21T18:00:00Z'],
  ['session2','2026-11-22','completato','2026-11-22T19:00:00Z']
];
const input=(local,remote=cloud)=>({
 headersByTab:{Allenamenti:header},
 localTables:{Allenamenti:local},
 remoteRanges:{Allenamenti:remote}
});
test('no-op read leaves remote data untouched',()=>{
 const p=planDeltaSync(input([{id:'session1',data:'2026-11-21',stato:'completato',updated_at:'2026-11-21T18:00:00Z'}]));
 assert.equal(p.updates.length,0);
 assert.equal(p.appends.length,0);
 assert.equal(p.merged.Allenamenti.length,2);
});
test('updates one identified row, never full sheet',()=>{
 const p=planDeltaSync(input([{id:'session1',data:'2026-11-21',stato:'annullato',updated_at:'2026-11-23T18:00:00Z'}]));
 assert.equal(p.updates.length,1);
 assert.equal(p.updates[0].range,"'Allenamenti'!A2:D2");
 assert.equal(p.updates[0].values[0][2],'annullato');
 assert.equal(p.merged.Allenamenti.find(x=>x.id==='session2').stato,'completato');
});
test('appends only new records',()=>{
 const p=planDeltaSync(input([{id:'session3',data:'2026-11-24',stato:'in_corso',updated_at:'2026-11-24T20:00:00Z'}]));
 assert.equal(p.updates.length,0);
 assert.equal(p.appends.length,1);
 assert.equal(p.appends[0].values.length,1);
 assert.equal(p.appends[0].values[0][0],'session3');
});
test('stale local records must not overwrite remote updates',()=>{
 const p=planDeltaSync(input([{id:'session2',data:'2026-11-22',stato:'in_corso',updated_at:'2026-11-21T19:00:00Z'}]));
 assert.equal(p.updates.length,0);
 assert.equal(p.merged.Allenamenti.find(x=>x.id==='session2').stato,'completato');
});
test('simultaneous edits fail closed',()=>{
 assert.throws(()=>planDeltaSync({...input([{id:'session1',data:'2026-11-21',stato:'annullato',updated_at:'2026-11-24T19:00:00Z'}],
  [header,['session1','2026-11-21','completato','2026-11-24T18:00:00Z']]),
  lastSync:'2026-11-22T00:00:00Z'}),/Conflitto simultaneo/);
});
test('dirty config updates only one value',()=>{
 const p=planDeltaSync({
  headersByTab:{Config:['chiave','valore']},
  localTables:{Config:[{chiave:'passi_giorno',valore:9000},{chiave:'target_kcal_pesi',valore:2000}]},
  remoteRanges:{Config:[['chiave','valore'],['passi_giorno',12000],['target_kcal_pesi',2000]]},
  dirtyConfig:['passi_giorno']});
 assert.equal(p.updates.length,1);
 assert.equal(p.updates[0].range,"'Config'!A2:B2");
 assert.equal(p.updates[0].values[0][1],9000);
});
test('invalid schema blocks all writes',()=>{
 assert.throws(()=>planDeltaSync(input([], [['bad','header']])),/Schema cloud/);
});
