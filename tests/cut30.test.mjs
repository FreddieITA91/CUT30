import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReport,canonicalWorkouts,rowsFromSheet,suggestTrainingDraft} from '../engine/cut30.mjs';

const data = {
  Allenamenti:[
    ['id','data','programma','durata_pesi_min','durata_cardio_min','durata_core_min','distanza_cardio_km','passi_tapis','kcal_attive','fc_media','fc_max','stato','updated_at'],
    ['old-phantom','2026-11-24','Lower A','','','','','','','','','completato','2026-11-24T10:00:00Z'],
    ['a-20261124','2026-11-24','Lower A',80,17,'',2,2000,860,129,164,'completato','2026-11-24T20:00:00Z'],
    ['a-20261119','2026-11-19','Upper B',71,10,'',1.27,1200,710,124,174,'completato','2026-11-19T20:00:00Z'],
    ['a-20261125','2026-11-25','Upper A',50,'','','',430,123,158,'in_corso','2026-11-25T19:00:00Z']
  ],
  Nutrizione:[
    ['id','data','pasto','alimento','quantita','unita','kcal','proteine','carboidrati','grassi','fibre','qualita','updated_at'],
    ['a','2026-11-23','Colazione','item',1,'pasto',300,30,20,10,2,'stimato','2026-11-23T08:00:00Z'],
    ['b','2026-11-23','Pranzo','item',1,'pasto',600,45,60,20,4,'stimato','2026-11-23T13:00:00Z'],
    ['c','2026-11-23','Cena','item',1,'pasto',500,50,50,10,6,'stimato','2026-11-23T20:00:00Z'],
    ['d','2026-11-24','Cena','item',1,'pasto',500,30,50,20,3,'stimato','2026-11-24T20:00:00Z'],
    ['e','2026-11-24','Pranzo','item',1,'pasto',999,99,99,99,3,'eliminato','2026-11-24T21:00:00Z']
  ],
  Carichi:[
    ['id','data','programma','esercizio','numero_serie','carico_kg','ripetizioni','unita_carico','origine','updated_at'],
    ['set1','2026-11-24','Lower A','Leg press',1,100,8,'kg macchina','confermato','2026-11-24T20:00:00Z'],
    ['set2','2026-11-24','Lower A','Leg press',2,100,8,'kg macchina','confermato','2026-11-24T20:00:00Z']
  ],
  Valutazioni:[
    ['id','data','programma','voto_1_5','esito','durata_pesi_min','durata_cardio_min','punti_forti','criticita','sfida_successiva','affidabilita','updated_at'],
    ['v1','2026-11-24','Lower A + cardio',4,'Crescita',80,17,'','','','media','2026-11-24T20:00:00Z']
  ],
  Misure:[
    ['id','data','peso_kg','contesto','passi_giornalieri','updated_at'],
    ['m1','2026-11-01',86.2,'pre allenamento','','2026-11-01T08:00:00Z'],
    ['m2','2026-11-10',86.0,'pre allenamento','','2026-11-10T08:00:00Z'],
    ['m3','2026-11-15',85.4,'post allenamento','','2026-11-15T08:00:00Z'],
    ['m4','2026-11-24',85.8,'pre allenamento','','2026-11-24T08:00:00Z']
  ]
};

test('reads sheet rows without inventing missing values',()=>{
  assert.equal(rowsFromSheet(data.Nutrizione,'Nutrizione').length,5);
  assert.throws(()=>rowsFromSheet([['id','data']],'Nutrizione'),/Schema non valido/);
});

test('canonical workout ignores phantom duplicates and keeps incomplete workout out of totals',()=>{
  const sessions=canonicalWorkouts(rowsFromSheet(data.Allenamenti,'Allenamenti'));
  assert.equal(sessions.length,3);
  assert.equal(sessions.find(x=>x.data==='2026-11-24').kcal_attive,860);
  const report=buildReport(data,'2026-11-25');
  assert.equal(report.activity.workouts_completed,2);
  assert.equal(report.activity.weights_minutes,151);
  assert.equal(report.activity.cardio_minutes,27);
  assert.equal(report.activity.tracker_estimated_kcal,1570);
  assert.equal(report.integrity.workouts_canonical,3);
});

test('nutrition requires three actual recorded meals to count a day',()=>{
  const report=buildReport(data,'2026-11-25');
  assert.equal(report.nutrition.days_logged,2);
  assert.equal(report.nutrition.three_meal_days,1);
  assert.equal(report.nutrition.average_kcal_complete_days,1400);
  assert.equal(report.nutrition.average_protein_g_complete_days,125);
  assert.equal(report.nutrition.days.find(x=>x.date==='2026-11-24').kcal,500);
  assert.ok(report.warnings.some(x=>x.startsWith('ALIMENTAZIONE')));
});

test('weight trend excludes post-workout measurements',()=>{
  const report=buildReport(data,'2026-11-25');
  assert.equal(report.weight_pre.samples,3);
  assert.equal(report.weight_pre.latest_kg,85.8);
  assert.ok(report.weight_pre.kg_per_week<0);
});

test('scores and sets reflect only confirmed sources',()=>{
  const report=buildReport(data,'2026-11-25');
  assert.equal(report.activity.recorded_sets,2);
  assert.equal(report.activity.rated_sessions,1);
  assert.equal(report.activity.average_rating,4);
});

test('draft never creates a completed workout',()=>{
  const draft=suggestTrainingDraft(data,'2026-11-26');
  assert.equal(draft.status,'bozza_da_confermare');
  assert.ok(draft.program.startsWith('Upper') || draft.program.startsWith('Lower'));
  assert.equal(draft.program,'Upper B');
  assert.equal(draft.cardio.duration_min,25);
  assert.equal(draft.cardio.target_average_hr_bpm,129);
});

test('weekly calendar wins over missed workouts and preserves cardio day',()=>{
  const draft=suggestTrainingDraft({},'2027-01-06',{start_date:'2027-01-04'});
  assert.equal(draft.program,'Cardio H + core');
  assert.equal(draft.cardio.duration_min,55);
  assert.equal(draft.core_minutes,15);
  assert.equal(draft.cardio.phases.reduce((s,p)=>s+p.duration_min,0),55);
  assert.ok(draft.cardio.phases.every(p=>p.target_average_hr_bpm>=p.indicative_range_bpm[0]&&p.target_average_hr_bpm<=p.indicative_range_bpm[1]));
  assert.equal(draft.cardio.target_average_hr_bpm,135.9);
});
test('explicit calendar overrides cycle, and recovery does not invent HR or minutes',()=>{
  const draft=suggestTrainingDraft({},'2027-01-06',{start_date:'2027-01-04',program:'Recupero'});
  assert.equal(draft.program,'Recupero');
  assert.equal(draft.source,'calendario_esplicito');
  assert.equal(draft.cardio.duration_min,0);
  assert.equal(draft.cardio.target_average_hr_bpm,null);
  assert.deepEqual(draft.cardio.phases,[]);
  assert.throws(()=>suggestTrainingDraft({},'2027-02-30'),/Data scheda/);
  assert.throws(()=>suggestTrainingDraft({},'2027-01-06',{program:'unknown'}),/Programma/);
});
test('completed date is not an invitation to repeat the session',()=>{
  const draft=suggestTrainingDraft(data,'2026-11-24',{program:'Lower A'});
  assert.equal(draft.status,'giornata_gia_conclusa');
});
