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

export function suggestTrainingDraft(rawTables, asOf) {
  const workouts = canonicalWorkouts(rowsFromSheet(rawTables.Allenamenti || [],'Allenamenti'))
    .filter(x=>x.stato==='completato' && x.data<=asOf && /\b(Upper|Lower)\s*[AB]\b/i.test(x.programma || ''));
  const programs=['Upper A','Lower A','Upper B','Lower B'];
  const last = Object.fromEntries(programs.map(p=>[p,workouts.filter(x=>x.programma===p).at(-1)?.data || null]));
  const priority = [...programs].sort((a,b)=>(last[a]||'').localeCompare(last[b]||''));
  const yesterday=new Date(dateMs(asOf)-86400000).toISOString().slice(0,10);
  const lastWorkout=workouts.at(-1);
  const preferred=priority.find(p=>!lastWorkout || (p.startsWith('Upper')!==String(lastWorkout.programma).startsWith('Upper') || lastWorkout.data<yesterday));
  return {date:asOf,status:'bozza_da_confermare',program:preferred||priority[0],
    cardio:{duration_min:25,target_average_hr_bpm:135,indicative_range_bpm:[130,140]},
    note:'Bozza automatica: verificare recupero, dolore, attrezzatura disponibile e piano settimanale prima di eseguire.'};
}
