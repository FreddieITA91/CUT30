import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTrainingLevel,xpForLevel,readCalibration,levelFromXP} from '../engine/training-level.mjs';
const today='2026-11-26',start='2026-11-02',workouts=[{id:'a',data:'2026-11-24',programma:'Lower A',stato:'completato',durata_pesi_min:60}];
const args={today,start,workouts,loadAvailable:true,cardioAvailable:true};
test('uncalibrated profile is not an assessment; XP stays available',()=>{const x=buildTrainingLevel(args);assert.equal(x.calibrated,false);assert.equal(x.total,5);assert.equal(x.events[0].level,null);});
test('calibration preserves earned XP, adds explicit initial game credit once',()=>{const calibration=JSON.stringify({version:1,profile:'experienced',date:today});const x=buildTrainingLevel({...args,calibration});assert.equal(x.calibrated,true);assert.equal(x.level,35);assert.equal(x.total,5);assert.equal(x.initialXP,xpForLevel(35));assert.equal(x.events[0].level,35);assert.equal(buildTrainingLevel({...args,calibration,workouts:[...workouts,...workouts]}).total,5);});
test('unknown, future and malformed calibration are rejected; thresholds invert exactly',()=>{assert.equal(readCalibration('broken',today),null);assert.equal(readCalibration({version:1,profile:'athlete',date:today},today),null);assert.equal(readCalibration({version:1,profile:'regular',date:'2026-12-01'},today),null);for(let l=1;l<=100;l++)assert.equal(levelFromXP(xpForLevel(l)).level,l);});
