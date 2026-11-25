// Deterministic review of evidence; historical targets are never reconstructed as assigned plans.
import {canonicalWorkouts,rowsFromSheet,byIdLatest} from './cut30.mjs';
import {summarizeCardioSegments} from './cardio-segments.mjs';
const numeric=v=>v==null||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
const round=v=>Math.round(v*10)/10;
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const median=values=>{const a=[...values].sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length?(a.length%2?a[i]:(a[i-1]+a[i])/2):null;};
export function reviewTrainingHistory(raw, draft){
  if(!draft||!validDate(draft.date)||!draft.cardio||!Number.isFinite(draft.cardio.duration_min)||draft.cardio.duration_min<0)throw Error('Bozza non valida');
  const program=draft.program,target=draft.cardio.duration_min;
  const hrTarget=numeric(draft.cardio.target_average_hr_bpm);
  const upper=hrTarget===null?null:hrTarget+5;
  // Exclude today's and future observations, and use only completed canonical sessions.
  const workouts=canonicalWorkouts(rowsFromSheet(raw.Allenamenti||[],'Allenamenti'))
    .filter(w=>validDate(w.data)&&w.data<draft.date&&w.stato==='completato'&&w.programma===program).slice(-3);
  const segments=rowsFromSheet(raw.CardioSegmenti||[],'CardioSegmenti');
  const ratings=byIdLatest(rowsFromSheet(raw.Valutazioni||[],'Valutazioni'));
  const observations=workouts.map(w=>{
    const minutes=numeric(w.durata_cardio_min);
    let detail=null,issue=null;
    try{detail=summarizeCardioSegments(segments,w.data);}catch{issue='segmenti_invalidi_o_in_conflitto';}
    const covered=detail&&minutes!==null&&minutes>0&&Math.abs(detail.minutes-minutes)<0.05&&detail.rows.every(s=>s.programma===program);
    const hr=covered&&detail.hr_coverage_minutes===detail.minutes?detail.hr_mean:null;
    const scores=ratings.filter(r=>r.data===w.data&&(r.programma===program||r.programma===program+' + cardio'||r.programma===program+' + piscina')&&numeric(r.voto_1_5)>=1&&numeric(r.voto_1_5)<=5);
    return {date:w.data,minutes,reference_minutes:target,reference_kind:'riferimento_attuale_non_obiettivo_storico',
      below_current_reference:target>0&&minutes!==null&&minutes>=0?minutes<target:null,
      hr_mean_cardio:hr,hr_source:hr===null?'non_verificabile':'segmenti_con_copertura_completa',
      above_current_hr_reference:upper!==null&&hr!==null?hr>upper:null,
      rating:scores.length===1?numeric(scores[0].voto_1_5):null,
      detail_status:issue||(covered?'copertura_completa':'copertura_non_verificata')};
  });
  const measured=observations.filter(o=>o.below_current_reference!==null);
  const hrMeasured=observations.filter(o=>o.above_current_hr_reference!==null);
  const below=measured.filter(o=>o.below_current_reference).length;
  const above=hrMeasured.filter(o=>o.above_current_hr_reference).length;
  const last=observations.at(-1);
  const actions=[];
  if(!target)actions.push({code:'RECUPERO',text:'Mantieni la giornata di recupero prevista; nessun recupero forzato dei minuti mancanti.'});
  else if(measured.length<2)actions.push({code:'BASELINE',text:'Storico insufficiente: registra almeno due sedute comparabili prima di adattare il volume.'});
  else if(below>=2)actions.push({code:'VOLUME',text:'Volume ripetutamente inferiore al riferimento attuale: mantieni la durata prevista e organizza le fasi per favorire continuità, senza compensazioni forzate.'});
  else actions.push({code:'CONSOLIDA',text:'Consolida il volume previsto e confronta il rendimento a pari condizioni.'});
  if(target&&above>=2)actions.push({code:'INTENSITA',text:'FC cardio ripetutamente sopra il riferimento indicativo attuale: conserva il target di durata se tollerato, riduci velocità o pendenza per rientrare nello sforzo previsto. Non aumentare la FC target.'});
  else if(target&&hrMeasured.length<2)actions.push({code:'DATI_FC',text:'FC specifica cardio insufficiente: registra i segmenti e la copertura completa prima di modificare l’intensità.'});
  if(draft.progression?.strength?.some(e=>e.references?.some(r=>r.action==='consolida_o_riduci')))actions.push({code:'SFORZO_FORZA',text:'Sforzo elevato documentato in almeno un esercizio: applica il consolidamento solo al riferimento di quella palestra/attrezzo.'});
  return {program,as_of:draft.date,status:observations.length>=2?'evidenza_descrittiva':'dati_insufficienti',
    historical_target_status:'non_disponibile',observations,actions,
    volume:{observed:measured.length,below_reference:below,median_minutes:median(measured.map(o=>o.minutes))},
    cardio_hr:{observed:hrMeasured.length,above_reference:above,comparison_upper_bpm:upper},
    next_plan:{program,duration_min:target,target_average_hr_bpm:hrTarget,phases:draft.cardio.phases,
      pacing_guidance:above>=2&&target?'riduci_ritmo_o_pendenza_se_necessario':'mantieni_riferimenti_e_verifica_tolleranza'},
    note:'Confronto descrittivo con la scheda attuale, non verifica di obiettivi storici assegnati. Non certifica adattamento fisiologico né modifica automaticamente calendario, durata o FC.'};
}
