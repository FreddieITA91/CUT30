/**
 * CUT30 Engine v1 — deterministic analytics. No health data or credentials in Git.
 * Accepts Google Sheets values arrays (header row + data) or arrays of objects.
 * This module never writes, guesses missing meals, or marks a workout completed.
 */
export const TABLE_HEADERS = Object.freeze({
  Nutrizione: ['id','data','pasto','alimento','quantita','unita','kcal','proteine','carboidrati','grassi','fibre','qualita','updated_at'],
  Allenamenti: ['id','data','programma','durata_pesi_min','durata_cardio_min','durata_core_min','distanza_cardio_km','passi_tapis','kcal_attive','fc_media','fc_max','stato','updated_at'],
  Esercizi: ['id','data','programma','esercizio','completato','updated_at'],
  Carichi: ['id','data','programma','esercizio','numero_serie','carico_kg','ripetizioni','unita_carico','origine','updated_at'],
  Misure: ['id','data','peso_kg','contesto','passi_giornalieri','updated_at'],
  Valutazioni: ['id','data','programma','voto_1_5','esito','durata_pesi_min','durata_cardio_min','punti_forti','criticita','sfida_successiva','affidabilita','updated_at']
});

const num = value => value == null || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const dateMs = iso => Date.parse(iso + 'T12:00:00Z');
const round = (x, places = 1) => Number(x.toFixed(places));
const validDate = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(dateMs(x));
const nondeleted = row => !['eliminato','annullato'].includes(String(row.qualita || row.stato || '').toLowerCase());

export function rowsFromSheet(raw, sheetName) {
  if (!Array.isArray(raw) || !raw.length) return [];
  if (raw[0] && !Array.isArray(raw[0])) return raw.filter(x => x && typeof x === 'object');
  const header = raw[0].map(String);
  const required = TABLE_HEADERS[sheetName] || [];
  if (required.some(x => !header.includes(x))) throw new Error('Schema non valido: ' + sheetName);
  return raw.slice(1).filter(x => x && x[0] != null && x[0] !== '').map(values => {
    const obj = {};
    header.forEach((key, idx) => obj[key] = values[idx] == null ? '' : values[idx]);
    return obj;
  });
}

export function byIdLatest(rows) {
  const seen = new Map();
  for (const row of rows) {
    if (!row?.id) continue;
    const old = seen.get(String(row.id));
    if (!old || String(row.updated_at || '') >= String(old.updated_at || '')) seen.set(String(row.id), row);
  }
  return [...seen.values()];
}

export function canonicalWorkouts(rows) {
  const groups = new Map();
  for (const row of byIdLatest(rows)) {
    if (!validDate(row.data) || row.stato === 'annullato') continue;
    const metrics = ['durata_pesi_min','durata_cardio_min','distanza_cardio_km','passi_tapis','kcal_attive'];
    const meaningful = metrics.some(k => (num(row[k]) || 0) > 0);
    if (!meaningful) continue; // discard old phantom duplicate workout rows
    if (!groups.has(row.data)) groups.set(row.data, []);
    groups.get(row.data).push(row);
  }
  return [...groups].map(([date, entries]) => {
    const priority = x =>
      (x.id === 'a-' + date.replaceAll('-', '') ? 1000 : 0) +
      (x.stato === 'completato' ? 100 : 0) +
      ['durata_pesi_min','durata_cardio_min','distanza_cardio_km','passi_tapis','kcal_attive','fc_media','fc_max'].filter(k => num(x[k]) !== null).length;
    entries.sort((a,b) => priority(b) - priority(a) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    const best = { ...entries[0] };
    // Do not overwrite a confirmed field from the selected canonical record.
    for (const other of entries.slice(1)) for (const key of ['durata_pesi_min','durata_cardio_min','durata_core_min','distanza_cardio_km','passi_tapis','kcal_attive','fc_media','fc_max'])
      if (num(best[key]) === null && num(other[key]) !== null) best[key] = other[key];
    if (entries.some(e => e.stato === 'completato')) best.stato = 'completato';
    return best;
  }).sort((a,b) => a.data.localeCompare(b.data));
}

function weightTrend(rows, asOf) {
  const weights = byIdLatest(rows).filter(x => validDate(x.data) && x.data <= asOf && num(x.peso_kg) > 0 &&
    /\bpre\b|prima/i.test(String(x.contesto || '')) && !/\bpost\b|dopo/i.test(String(x.contesto || '')));
  // For same day, use the latest PRE measurement only. Never combine PRE/POST.
  const byDay = new Map();
  for (const x of weights.sort((a,b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')))) byDay.set(x.data, x);
  const samples = [...byDay.values()].sort((a,b) => a.data.localeCompare(b.data));
  const span = samples.length > 1 ? (dateMs(samples.at(-1).data) - dateMs(samples[0].data)) / 86400000 : 0;
  if (samples.length < 3 || span < 7) return { status:'dati_insufficienti', samples:samples.length, kg_per_week:null };
  const xs = samples.map(x => (dateMs(x.data) - dateMs(samples[0].data))/86400000);
  const ys = samples.map(x => num(x.peso_kg));
  const xm = xs.reduce((a,b)=>a+b,0)/xs.length, ym = ys.reduce((a,b)=>a+b,0)/ys.length;
  const denominator = xs.reduce((a,x)=>a+(x-xm)**2,0);
  const slope = denominator ? xs.reduce((a,x,i)=>a+(x-xm)*(ys[i]-ym),0)/denominator : 0;
  return { status:'stima', samples:samples.length, kg_per_week:round(slope*7,2),
    from:samples[0].data,to:samples.at(-1).data,latest_kg:num(samples.at(-1).peso_kg),
    note:'Solo pesate PRE, stessa fascia oraria e condizioni ancora da verificare' };
}

export function buildReport(rawTables, asOf) {
  if (!validDate(asOf)) throw new Error('Data analisi non valida (YYYY-MM-DD)');
  const sheets = Object.fromEntries(Object.keys(TABLE_HEADERS).map(k => [k,byIdLatest(rowsFromSheet(rawTables[k] || [], k))]));
  const workouts = canonicalWorkouts(sheets.Allenamenti);
  const from = new Date(dateMs(asOf) - 13*86400000).toISOString().slice(0,10);
  const recentWorkouts = workouts.filter(x => x.data >= from && x.data <= asOf && x.stato === 'completato');
  const meals = sheets.Nutrizione.filter(x => validDate(x.data) && x.data <= asOf && x.data >= from && nondeleted(x));
  const days = new Map();
  for (const r of meals) {
    const group = days.get(r.data) || { date:r.data, kcal:0,protein_g:0,carbs_g:0,fat_g:0,fiber_g:0,meals:new Set(),entries:0,missing_macros:0 };
    group.meals.add(String(r.pasto || '').toLowerCase());
    group.entries++;
    for (const [key,field] of [['kcal','kcal'],['protein_g','proteine'],['carbs_g','carboidrati'],['fat_g','grassi'],['fiber_g','fibre']]) {
      const v = num(r[field]); if (v !== null) group[key] += v;
      else if (['kcal','proteine'].includes(field)) group.missing_macros++;
    }
    days.set(r.data,group);
  }
  const nutrition = [...days.values()].sort((a,b) => a.date.localeCompare(b.date)).map(x => ({
    date:x.date,kcal:round(x.kcal),protein_g:round(x.protein_g),carbs_g:round(x.carbs_g),
    fat_g:round(x.fat_g),fiber_g:round(x.fiber_g),entries:x.entries,
    recorded_meals:[...x.meals],
    three_meals_recorded:['colazione','pranzo','cena'].every(m=>x.meals.has(m)),
    missing_macros:x.missing_macros
  }));
  const completeDays = nutrition.filter(x => x.three_meals_recorded && !x.missing_macros);
  const total = key => round(recentWorkouts.reduce((a,x)=>a+(num(x[key])||0),0));
  const loadSets = sheets.Carichi.filter(x=>x.data >= from && x.data <= asOf && num(x.numero_serie) !== null);
  const scoreRows = sheets.Valutazioni.filter(x=>x.data>=from && x.data<=asOf && num(x.voto_1_5)!==null);
  const trend = weightTrend(sheets.Misure,asOf);
  const warnings=[];
  if (completeDays.length < 7) warnings.push('ALIMENTAZIONE: meno di 7 giorni con colazione, pranzo e cena registrati negli ultimi 14; deficit calorico non verificabile.');
  if (trend.status !== 'stima') warnings.push('PESO: servono almeno 3 pesate PRE su almeno 7 giorni per stimare una tendenza.');
  if (!loadSets.length) warnings.push('CARICHI: nessuna serie dettagliata negli ultimi 14 giorni.');
  return {
    schema_version:'1.0',as_of:asOf,window:{from,to:asOf,days:14},
    activity:{workouts_completed:recentWorkouts.length,weights_minutes:total('durata_pesi_min'),
      cardio_minutes:total('durata_cardio_min'),tracker_estimated_kcal:total('kcal_attive'),
      training_dates:recentWorkouts.map(x=>x.data),recorded_sets:loadSets.length,
      rated_sessions:scoreRows.length,
      average_rating:scoreRows.length?round(scoreRows.reduce((a,x)=>a+num(x.voto_1_5),0)/scoreRows.length,2):null},
    nutrition:{days_logged:nutrition.length,three_meal_days:completeDays.length,days:nutrition,
      average_kcal_complete_days:completeDays.length?round(completeDays.reduce((a,x)=>a+x.kcal,0)/completeDays.length):null,
      average_protein_g_complete_days:completeDays.length?round(completeDays.reduce((a,x)=>a+x.protein_g,0)/completeDays.length):null,
      note:'Tre pasti registrati non garantiscono l\'assenza di snack, oli o bevande non dichiarati.'},
    weight_pre:trend,warnings,
    integrity:{workouts_source_records:sheets.Allenamenti.length,workouts_canonical:workouts.length,
      no_machine_comparison_without_equipment_id:true,calories_burned_not_deficit:true}
  };
}

// The calendar is authoritative; missed sessions are observations, not automatic substitutions.
const TRAINING_WEEK = ['Upper A','Lower A','Cardio H + core','Upper B','Lower B','Cardio Z','Recupero'];
const DAY_MS = 86400000;
const phase = (label, minutes, hr, range, speed, incline) => ({
  label, duration_min:minutes, target_average_hr_bpm:hr, indicative_range_bpm:range,
  treadmill_speed_kmh:speed, incline_pct:incline
});
function cardioPhases(program) {
  if (program==='Recupero') return [];
  if (program==='Cardio H + core') return [
    phase('Riscaldamento',5,120,[115,125],[5,5.5],2),
    phase('Moderata',20,135,[130,140],[6,6.5],4),
    phase('Sostenuta',20,145,[140,150],[6,6.5],5),
    phase('Consolidamento',5,135,[130,140],[5.5,6],3),
    phase('Defaticamento',5,120,[115,125],[4.5,5],0)
  ];
  if (program==='Cardio Z') return [
    phase('Riscaldamento',5,120,[115,125],[5,5.5],1),
    phase('Continuo moderato',45,135,[130,140],[5.5,6.5],3),
    phase('Defaticamento',5,120,[115,125],[4.5,5],0)
  ];
  return [
    phase('Riscaldamento',5,120,[115,125],[5,5.5],1),
    phase('Moderata',program.startsWith('Lower')?20:15,135,[130,140],[5.5,6.5],3),
    phase('Defaticamento',5,120,[115,125],[4.5,5],0)
  ];
}
export function suggestTrainingDraft(rawTables, asOf, options={}) {
  if (!validDate(asOf) || new Date(dateMs(asOf)).toISOString().slice(0,10)!==asOf)
    throw new Error('Data scheda non valida');
  const start=options.start_date || '2026-11-02';
  if (!validDate(start) || new Date(dateMs(start)).toISOString().slice(0,10)!==start)
    throw new Error('Data inizio non valida');
  const offset=Math.round((dateMs(asOf)-dateMs(start))/DAY_MS);
  const scheduled=TRAINING_WEEK[((offset%7)+7)%7];
  const program=options.program || scheduled;
  if (!TRAINING_WEEK.includes(program)) throw new Error('Programma non riconosciuto');
  const workouts=canonicalWorkouts(rowsFromSheet(rawTables.Allenamenti || [],'Allenamenti'));
  const completed=workouts.find(x=>x.data===asOf && x.stato==='completato');
  const previous=workouts.filter(x=>x.data<asOf && x.stato==='completato');
  const last=previous.filter(x=>x.programma===program).at(-1);
  const phases=cardioPhases(program);
  const duration=phases.reduce((sum,p)=>sum+p.duration_min,0);
  const mean=duration?round(phases.reduce((sum,p)=>sum+p.duration_min*p.target_average_hr_bpm,0)/duration,1):null;
  return {
    date:asOf,status:completed?'giornata_gia_conclusa':'bozza_da_confermare',
    program,source:options.program?'calendario_esplicito':'ciclo_settimanale',
    previous_comparable:last?{date:last.data,cardio_minutes:num(last.durata_cardio_min),weights_minutes:num(last.durata_pesi_min)}:null,
    cardio:{duration_min:duration,target_average_hr_bpm:mean,phases},
    core_minutes:program==='Cardio H + core'?15:0,
    progression:buildProgression(rawTables,asOf,program,duration,options.exercises||[]),
    note:completed?'Seduta già conclusa: scheda di riferimento, non ripetere automaticamente.':
      'Riferimenti FC indicativi, non zone personali validate. Regolare velocità e pendenza con fatica percepita, recupero e sintomi; non inseguire picchi. Nessuna sostituzione automatica del programma.'
  };
}

// Progression is a proposed next objective, not proof of physiological adaptation.
// Never compare untagged/ambiguous equipment, or infer RIR from load or heart rate.
const normalized = value => String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
function equipmentIdentity(value) {
  const match=String(value||'').trim().match(/^(kg macchina|kg per mano|kg totale)\s*\|\s*palestra\s+([^|]+)\s*\|\s*attrezzo\s+([^|]+)$/i);
  if (!match || !match[2].trim() || !match[3].trim() || /^(non identificato|non specificato|corpo libero)$/i.test(match[3].trim())) return null;
  return {unit:match[1].toLowerCase(),gym:match[2].trim(),equipment:match[3].trim()};
}
function repLimits(dose) {
  const m=String(dose||'').match(/^\s*\d+\s*[×x]\s*(\d+)(?:[–-](\d+))?(?:\s+per lato)?\s*$/i);
  if(!m) return null;
  return {min:Number(m[1]),max:Number(m[2]||m[1])};
}
export function buildProgression(rawTables, asOf, program, cardioTarget, exercises=[]) {
  if (!validDate(asOf)) throw new Error('Data progressione non valida');
  const history=canonicalWorkouts(rowsFromSheet(rawTables.Allenamenti||[],'Allenamenti'))
    .filter(x=>x.data<asOf&&x.stato==='completato'&&x.programma===program);
  const last=history.at(-1);
  const cardioRows=history.filter(x=>num(x.durata_cardio_min)>0).slice(-3);
  const previous=cardioRows.at(-1);
  const actual=previous?num(previous.durata_cardio_min):null;
  const cardio={target_minutes:cardioTarget,previous_minutes:actual,
    previous_date:previous?.data||null,previous_three_minutes:cardioRows.map(x=>({date:x.data,minutes:num(x.durata_cardio_min)})),
    remaining_to_planned:actual===null?null:Math.max(0,cardioTarget-actual),
    objective:!cardioTarget?'recupero':actual===null?'stabilisci_riferimento':actual<cardioTarget?'completa_volume_programmato':'consolida_efficienza',
    note:'Non aumentare la FC per inseguire la progressione. Confrontare distanza/ritmo solo con modalità, protocollo e FC comparabili; la FC aggregata non identifica la singola attività.'};
  const previousDates=new Set(history.map(x=>x.data));
  const rows=byIdLatest(rowsFromSheet(rawTables.Carichi||[],'Carichi')).filter(x=>
    x.programma===program&&previousDates.has(x.data)&&nondeleted(x)&&
    Number.isInteger(num(x.numero_serie))&&num(x.numero_serie)>0&&num(x.carico_kg)!==null&&num(x.carico_kg)>=0&&
    Number.isInteger(num(x.ripetizioni))&&num(x.ripetizioni)>0&&num(x.ripetizioni)<=100);
  const strength=exercises.map(ex=>{
    const allowed=String(ex.name||'').split('/').map(normalized).filter(Boolean);
    const bounds=repLimits(ex.dose);
    const matching=rows.filter(x=>allowed.includes(normalized(x.esercizio)));
    const groups=new Map();
    for(const x of matching){
      const ident=equipmentIdentity(x.unita_carico);
      if(!ident)continue;
      const key=JSON.stringify([normalized(x.esercizio),normalized(ident.unit),normalized(ident.gym),normalized(ident.equipment)]);
      const group=groups.get(key)||{...ident,exercise:x.esercizio,rows:[]};
      group.rows.push(x);groups.set(key,group);
    }
    const references=[...groups.values()].map(g=>{
      const date=g.rows.map(x=>x.data).sort().at(-1);
      const sameDay=g.rows.filter(x=>x.data===date);
      const bySet=new Map();
      for(const x of sameDay){
        const old=bySet.get(num(x.numero_serie));
        if(!old||String(x.updated_at||'')>=String(old.updated_at||''))bySet.set(num(x.numero_serie),x);
      }
      const sets=[...bySet.values()].sort((a,b)=>num(a.numero_serie)-num(b.numero_serie));
      const decision=decideSetProgression(sets,bounds,Number(ex.sets)||Number(String(ex.dose||'').match(/^\s*(\d+)/)?.[1]));
      return decision?{exercise:g.exercise,gym:g.gym,equipment:g.equipment,unit:g.unit,date,...decision}:null;
    }).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date)||a.gym.localeCompare(b.gym)||a.equipment.localeCompare(b.equipment));
    return {exercise_id:ex.id,exercise:ex.name,dose:ex.dose,rest:ex.rest,
      references,untagged_records:matching.filter(x=>!equipmentIdentity(x.unita_carico)).length,
      status:references.length?'riferimento_attrezzo':matching.length?'storico_non_comparabile':'riferimento_da_registrare'};
  });
  return {previous_session_date:last?.data||null,cardio,strength,
    note:'Obiettivi verificabili, non prescrizioni automatiche. Recupero e qualità prima di aumentare volume o carico.'};
}

const EFFORT_TAG=' | CUT30_EFFORT_V1=';
export function validateSetEffort(input={}){
  const optional=(v,min,max,step=1)=>{
    if(v===null||v===undefined||String(v).trim()==='')return null;
    const n=Number(v);
    if(!Number.isFinite(n)||n<min||n>max||!Number.isInteger(n/step))throw new Error('RIR/RPE non valido');
    return n;
  };
  const type=String(input.tipo_serie||'non_specificata');
  if(!['allenante','riscaldamento','non_specificata'].includes(type))throw new Error('Tipo serie non valido');
  const rir=optional(input.rir,0,10),rpe=optional(input.rpe,1,10,0.5);
  // RPE of a strength set uses the RIR-based scale only for RPE >= 6.
  if(rir!==null&&rpe!==null&&rpe>=6&&Math.abs(rir-(10-rpe))>1)throw new Error('RIR e RPE incoerenti');
  return {tipo_serie:type,rir,rpe};
}
export function encodeSetEffort(origin,input){
  return String(origin||'').split(EFFORT_TAG)[0]+EFFORT_TAG+JSON.stringify(validateSetEffort(input));
}
export function readSetEffort(origin){
  const raw=String(origin||'');
  if(!raw.includes(EFFORT_TAG))return validateSetEffort();
  try{return validateSetEffort(JSON.parse(raw.split(EFFORT_TAG).at(-1)));}
  catch{return validateSetEffort();}
}
// Decisions are conditional and do not assume a machine has a particular increment.
export function decideSetProgression(sets,bounds,plannedSets){
  const tagged=sets.map(x=>({...x,effort:readSetEffort(x.origine)}));
  const working=tagged.filter(x=>x.effort.tipo_serie==='allenante');
  const unknown=tagged.filter(x=>x.effort.tipo_serie==='non_specificata');
  const eligible=working.length?working:unknown;
  const peak=[...eligible].sort((a,b)=>num(b.carico_kg)-num(a.carico_kg)||num(b.ripetizioni)-num(a.ripetizioni))[0];
  if(!peak)return null;
  const kg=num(peak.carico_kg),reps=num(peak.ripetizioni);
  const known=working.filter(x=>x.effort.rir!==null||x.effort.rpe!==null);
  const effort=peak.effort;
  const strenuous=known.some(x=>(x.effort.rir!==null&&x.effort.rir<=1)||(x.effort.rpe!==null&&x.effort.rpe>=9));
  const enough=Number.isInteger(plannedSets)&&plannedSets>0&&working.length>=plannedSets;
  const sameLoad=working.every(x=>num(x.carico_kg)===kg);
  const reserve=working.every(x=>x.effort.rir!==null&&x.effort.rir>=2&&(x.effort.rpe===null||x.effort.rpe<=8));
  const atTop=Boolean(bounds)&&working.every(x=>num(x.ripetizioni)>=bounds.max);
  let action='verifica_prima_di_progredire',next=null,loadIncrease=false;
  let note='Riferimento non certificato come serie allenante o RIR mancante: verifica prima di aumentare. Non dedurre la fatica dal carico.';
  if(strenuous){
    action='consolida_o_riduci';
    note='Sforzo elevato registrato (RIR 0–1 o RPE ≥9): non aumentare carico o ripetizioni; consolida o riduci se necessario.';
  }else if(enough&&sameLoad&&reserve&&atTop&&kg>0){
    action='incremento_carico_condizionato';loadIncrease=true;
    note='Serie allenanti previste completate al limite alto con RIR ≥2. Solo se tecnica e recupero adeguati, prova il più piccolo incremento disponibile sullo stesso attrezzo, ripartendo dal limite basso. Nessun kg inventato.';
  }else if(bounds&&reps>=bounds.min&&reps<bounds.max){
    next=reps+1;action='una_ripetizione_in_piu_condizionata';
    note=effort.rir!==null&&effort.rir>=2?'Prova una ripetizione in più allo stesso carico mantenendo almeno 2 RIR e tecnica stabile.':'RIR non sufficiente o non registrato: una ripetizione in più solo se puoi mantenere almeno 2 RIR, tecnica e recupero adeguati.';
  }else if(working.length){
    note='Consolida il range previsto. Per aumentare il carico servono tutte le serie allenanti previste allo stesso carico, al limite alto, con RIR ≥2.';
  }
  return {reference_kg:kg,reference_reps:reps,conditional_target_reps:next,action,load_increase_allowed:loadIncrease,reference_rir:effort.rir,reference_rpe:effort.rpe,working_sets:working.length,effort_sets:known.length,recorded_sets:sets.length,unknown_sets:unknown.length,note};
}
