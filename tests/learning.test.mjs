import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewTrainingHistory as review} from '../engine/learning.mjs';
const program='Cardio H + core';
const draft={date:'2027-03-24',program,cardio:{duration_min:55,target_average_hr_bpm:136,phases:[]}};
const workout=(date,min,status='completato',p=program)=>({id:'a-'+date.replaceAll('-',''),data:date,programma:p,stato:status,durata_cardio_min:min,fc_media:190});
const seg=(date,min,hr,p=program)=>({data:date,programma:p,modalita:'tapis',numero_segmento:1,durata_min:min,fc_media:hr,updated_at:date+'T20:00:00Z'});
const rows=[workout('2027-03-03',40),workout('2027-03-10',45),workout('2027-03-17',55,'in_corso'),workout('2027-03-24',60),workout('2027-03-25',60),workout('2027-03-16',25,'completato','Upper A')];
test('uses only earlier completed same-program sessions and never invents assigned targets',()=>{
 const r=review({Allenamenti:rows},draft);
 assert.equal(r.observations.length,2);assert.equal(r.volume.below_reference,2);assert.equal(r.volume.median_minutes,42.5);assert.equal(r.historical_target_status,'non_disponibile');
 assert.ok(r.actions.some(x=>x.code==='VOLUME'));assert.equal(r.next_plan.duration_min,55);assert.equal(r.cardio_hr.observed,0);
});
test('repeated elevated cardio-specific HR adjusts guidance, not calendar, volume or target HR',()=>{
 const r=review({Allenamenti:rows,CardioSegmenti:[seg('2027-03-03',40,150),seg('2027-03-10',45,145)]},draft);
 assert.equal(r.cardio_hr.above_reference,2);assert.equal(r.next_plan.pacing_guidance,'riduci_ritmo_o_pendenza_se_necessario');assert.equal(r.next_plan.duration_min,55);assert.equal(r.next_plan.target_average_hr_bpm,136);assert.equal(r.next_plan.program,program);
});
test('missing or partial segments do not use aggregated workout HR',()=>{
 const r=review({Allenamenti:rows,CardioSegmenti:[seg('2027-03-03',20,160),seg('2027-03-10',45,160,'Upper A')]},draft);
 assert.equal(r.cardio_hr.observed,0);assert.ok(r.actions.some(x=>x.code==='DATI_FC'));assert.ok(!r.actions.some(x=>x.code==='INTENSITA'));
});
test('missing history and rest do not invent progression',()=>{
 assert.equal(review({},draft).status,'dati_insufficienti');
 const r=review({},{...draft,program:'Recupero',cardio:{duration_min:0,target_average_hr_bpm:null,phases:[]}});
 assert.equal(r.actions[0].code,'RECUPERO');assert.equal(r.next_plan.duration_min,0);
});
test('strength effort guidance is local and does not escalate load',()=>{
 const r=review({}, {...draft,progression:{strength:[{references:[{action:'consolida_o_riduci'}]}]}});
 assert.ok(r.actions.some(x=>x.code==='SFORZO_FORZA'));assert.equal(r.next_plan.duration_min,55);
});
