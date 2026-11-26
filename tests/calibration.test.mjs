import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTrainingLevel,xpForLevel,readCalibration,levelFromXP} from '../engine/training-level.mjs';
const today='2026-11-26',start='2026-11-02',workouts=[{id:'a',data:'2026-11-24',programma:'Lower A',stato:'completato',durata_pesi_min:60}];
const args={today,start,workouts,loadAvailable:true,cardioAvailable:true};
test('uncalibrated profile is not an assessment; XP stays available',()=>{const x=buildTrainingLevel(args);assert.equal(x.calibrated,false);assert.equal(x.total,5);assert.equal(x.events[0].level,null);});
test('calibration preserves earned XP, adds explicit initial game credit once',()=>{const calibration=JSON.stringify({version:1,profile:'experienced',date:today});const x=buildTrainingLevel({...args,calibration});assert.equal(x.calibrated,true);assert.equal(x.level,35);assert.equal(x.total,5);assert.equal(x.initialXP,xpForLevel(35));assert.equal(x.events[0].level,35);assert.equal(buildTrainingLevel({...args,calibration,workouts:[...workouts,...workouts]}).total,5);});
test('unknown, future and malformed calibration are rejected; thresholds invert exactly',()=>{assert.equal(readCalibration('broken',today),null);assert.equal(readCalibration({version:1,profile:'athlete',date:today},today),null);assert.equal(readCalibration({version:1,profile:'regular',date:'2026-12-01'},today),null);for(let l=1;l<=100;l++)assert.equal(levelFromXP(xpForLevel(l)).level,l);});

test('confirmed starting level can decrease after repeated measured decline, without negative absolute XP',async()=>{
 const {encodeSetEffort}=await import('../engine/cut30.mjs');
 const dates=['2026-11-05','2026-11-12','2026-11-19'],ws=dates.map(data=>({id:data,data,programma:'Upper A',stato:'completato',durata_pesi_min:45}));
 const loads=dates.map((data,i)=>({id:data,data,programma:'Upper A',esercizio:'Panca',numero_serie:1,carico_kg:[50,45,40][i],ripetizioni:8,unita_carico:'kg totale | palestra A | attrezzo panca',origine:encodeSetEffort('',{tipo_serie:'allenante',rir:2})}));
 const x=buildTrainingLevel({...args,workouts:ws,loads,calibration:{version:1,profile:'regular',date:'2026-11-12'}});
 assert.equal(x.events.at(-1).outcome,'decline');assert.equal(x.total,-10);assert.equal(x.level,19);
});
