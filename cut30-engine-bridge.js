/* CUT30 Engine Bridge — additive UI. Uses targeted private writes alongside delta sync.
   Carichi, Valutazioni and AnalisiAuto remain exclusively in private Google Sheets.
   Only explicit form submissions write a single identified row. */
(function cut30EngineBridge(){
  'use strict';
  let engine=null, recipeEngine=null, cardioEngine=null, learningEngine=null, planEngine=null, auditEngine=null, auditSaving=false, planLoaded=false, planSaving=false, cardioLoaded=false, busy=false, loadedAt=0, currentRecipe=null;
  const cache={Carichi:[],Valutazioni:[],AnalisiAuto:[],CardioSegmenti:[],SchedeConfermate:[],CicloAuto:[]};
  const headers={
    Carichi:['id','data','programma','esercizio','numero_serie','carico_kg','ripetizioni','unita_carico','origine','updated_at'],
    Nutrizione:['id','data','pasto','alimento','quantita','unita','kcal','proteine','carboidrati','grassi','fibre','qualita','updated_at']
  };
  const fmtN=(v,d=0)=>Number(v||0).toLocaleString('it-IT',{maximumFractionDigits:d});
  const connected=()=>Boolean(token && Date.now()<tokenExpires-30000);
  function parseTable(raw){
    if(!Array.isArray(raw)||!raw.length)return [];
    const header=raw[0].map(String);
    return raw.slice(1).filter(r=>r && r[0]!=='' && r[0]!==undefined).map(r=>{
      const record={};header.forEach((k,i)=>record[k]=r[i]===undefined?'':r[i]);return record;
    });
  }
  function formatWarn(message){return '<div class="warning-note">'+h(message)+'</div>';}
  async function refreshCloud(silent=false){
    if(busy||!connected()){if(!silent)toast('Connetti Google in Impostazioni per caricare i dati privati.');return;}
    busy=true;
    const sourceSheet=state.prefs.sheetId;
    try{
      const params=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE'});
      const end={Carichi:'J',Valutazioni:'L',AnalisiAuto:'P'};
      ['Carichi','Valutazioni','AnalisiAuto'].forEach(x=>params.append('ranges',"'"+x+"'!A:"+end[x]));
      // AnalisiAuto might not exist before the first server-side job.
      let result;
      try{result=await googleApi('/values:batchGet?'+params.toString());}
      catch(e){
        const fallback=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE'});
        ['Carichi','Valutazioni'].forEach(x=>fallback.append('ranges',"'"+x+"'!A:"+end[x]));
        result=await googleApi('/values:batchGet?'+fallback.toString());
        cache.AnalisiAuto=[];
      }
      const loadValues=result.valueRanges?.[0]?.values;
      if(!Array.isArray(loadValues)||!loadValues.length||headers.Carichi.some((k,i)=>loadValues[0][i]!==k))throw Error('Schema Carichi inatteso: storico non verificato');
      if(sourceSheet!==state.prefs.sheetId)throw Error('Diario cambiato durante la lettura');
      cache.Carichi=parseTable(loadValues);
      window.cut30SetLoadEvidence?.(cache.Carichi,Date.now(),sourceSheet);
      cache.Valutazioni=parseTable(result.valueRanges?.[1]?.values||[]);
      if(result.valueRanges?.[2])cache.AnalisiAuto=parseTable(result.valueRanges[2].values||[]);
      try{await loadCardio();}catch(err){cardioLoaded=false;cache.CardioSegmenti=[];console.warn('Cardio detail unavailable');}
      try{await loadPlans();}catch(err){planLoaded=false;cache.SchedeConfermate=[];window.cut30SetConfirmedPlans?.([]);console.warn('Plan archive unavailable');}
      try{
        const meta=await googleApi('?fields=sheets.properties.title');
        cache.CicloAuto=meta.sheets?.some(x=>x.properties.title==='CicloAuto')?parseTable((await googleApi('/values/'+encodeURIComponent("'CicloAuto'!A:I")+'?valueRenderOption=UNFORMATTED_VALUE')).values||[]):[];
      }catch{cache.CicloAuto=[];}
      if(sourceSheet!==state.prefs.sheetId)throw Error('Diario cambiato durante la lettura');
      loadedAt=Date.now();
      if(engine)render();
      if(!silent)toast('Motore CUT30: dati privati aggiornati.');
    }catch(err){console.error('CUT30 Engine refresh:',err);if(!silent)toast('Aggiornamento motore non riuscito: '+err.message);}
    finally{busy=false;}
  }
  function report(){
    if(!engine)return null;
    try{return engine.buildReport({
      Nutrizione:state.tables.Nutrizione,Allenamenti:state.tables.Allenamenti,
      Misure:state.tables.Misure,Carichi:cache.Carichi,Valutazioni:cache.Valutazioni
    },localDate());}catch(err){console.warn('CUT30 report:',err.message);return null;}
  }
  function summary(){
    const cycle=cache.CicloAuto.slice().sort((x,y)=>String(y.data_analisi).localeCompare(String(x.data_analisi)))[0];
    const a=report();
    const row=cache.AnalisiAuto.slice().sort((x,y)=>String(y.data_analisi).localeCompare(String(x.data_analisi)))[0];
    if(!a)return formatWarn('Motore analitico in caricamento.');
    return '<section class="panel cut30-engine"><div class="panel-head"><div><h2 class="section-title">CUT30 Engine · Analisi automatica</h2><p class="section-subtitle">Ultimi 14 giorni · Fonte Google Sheets privato</p></div><button type="button" class="btn btn-quiet btn-sm" data-cut30-refresh>↻ Aggiorna</button></div>'+
      '<div class="grid g3">'+
      '<div class="stat"><div class="label">Sessioni concluse</div><div class="number">'+fmtN(a.activity.workouts_completed)+'</div></div>'+
      '<div class="stat"><div class="label">Pesi / cardio</div><div class="number">'+fmtN(a.activity.weights_minutes)+' / '+fmtN(a.activity.cardio_minutes)+'</div><div class="note">Minuti · 14 giorni</div></div>'+
      '<div class="stat"><div class="label">Giorni con 3 pasti</div><div class="number">'+fmtN(a.nutrition.three_meal_days)+'/14</div></div>'+
      '<div class="stat"><div class="label">Serie confermate</div><div class="number">'+(loadedAt?fmtN(a.activity.recorded_sets):'—')+'</div></div>'+
      '<div class="stat"><div class="label">Voto medio</div><div class="number">'+(!loadedAt||a.activity.average_rating===null?'—':fmtN(a.activity.average_rating,2)+'/5')+'</div></div>'+
      '<div class="stat"><div class="label">Trend peso PRE</div><div class="number">'+(a.weight_pre.kg_per_week===null?'—':fmtN(a.weight_pre.kg_per_week,2)+' kg/sett')+'</div></div></div>'+
      (cycle?'<p class="sm">Ultimo ciclo automatico: '+h(cycle.data_analisi)+' · prossima scheda '+h(cycle.data_scheda)+' '+h(cycle.programma||'')+' · '+h(cycle.stato_scheda)+' · audit valutabili '+h(String(cycle.audit_valutabili))+'</p>':'<p class="tiny muted">Ciclo automatico server non ancora disponibile.</p>')+
      '<p class="tiny muted">Calorie stimate dal tracker: '+fmtN(a.activity.tracker_estimated_kcal)+' kcal (NON rappresentano il deficit).</p>'+
      (a.warnings.length?'<div class="warning-note">'+a.warnings.map(w=>'<p>'+h(w)+'</p>').join('')+'</div>':'')+
      '<p class="tiny muted">Analisi su dati locali sincronizzati e carichi privati. '+(row?'Ultimo report GitHub Actions: '+h(row.data_analisi)+'.':'Report server-side non ancora disponibile.')+
      ' '+(loadedAt?'Carichi aggiornati alle '+new Date(loadedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})+'.':'Per caricare Carichi e Valutazioni: collega Google e premi Aggiorna.')+'</p></section>';
  }
  function latestLoads(){
    const sets=cache.Carichi.slice().sort((a,b)=>String(b.data).localeCompare(String(a.data))||Number(b.numero_serie)-Number(a.numero_serie)).slice(0,12);
    const ratings=cache.Valutazioni.slice().sort((a,b)=>String(b.data).localeCompare(String(a.data))).slice(0,5);
    return '<section class="panel"><div class="panel-head"><h2 class="section-title">Carichi e valutazioni confermate</h2></div>'+
      '<div class="grid g2"><div><div class="small-title">Ultime serie</div>'+
      (sets.length?sets.map(x=>'<div class="entry"><div class="entry-main"><strong>'+h(x.esercizio)+'</strong><small>'+h(x.data)+' · serie '+h(String(x.numero_serie))+' · '+h(x.unita_carico||'unità non dichiarata')+'</small></div><div class="entry-val">'+h(String(x.carico_kg))+' kg × '+h(String(x.ripetizioni))+'</div></div>').join(''):'<p class="sm muted">Connetti Google per visualizzare le serie.</p>')+
      '</div><div><div class="small-title">Ultimi voti CUT30</div>'+
      (ratings.length?ratings.map(x=>'<div class="entry"><div class="entry-main"><strong>'+h(x.programma)+'</strong><small>'+h(x.data)+'</small></div><div class="entry-val">'+h(String(x.voto_1_5))+'/5</div></div>').join(''):'<p class="sm muted">Valutazioni non ancora caricate.</p>')+
      '</div></div></section>';
  }
  function cardioDraft(suggest){
    const c=suggest.cardio;
    const phases=c.phases.map(p=>'<div class="entry"><div class="entry-main"><strong>'+h(p.label)+' · '+p.duration_min+' min</strong><small>'+h(p.treadmill_speed_kmh.join('–'))+' km/h · pendenza '+p.incline_pct+'%</small></div><div class="entry-val">'+p.target_average_hr_bpm+' bpm<small> ('+h(p.indicative_range_bpm.join('–'))+')</small></div></div>').join('');
    return '<div class="small-title">Scheda calendarizzata · '+h(suggest.program)+'</div>'+
      '<p class="sm">'+h(suggest.date)+' · cardio '+c.duration_min+' min'+(c.target_average_hr_bpm===null?'':' · FC media indicativa '+fmtN(c.target_average_hr_bpm,1)+' bpm')+(suggest.core_minutes?' · core '+suggest.core_minutes+' min':'')+'</p>'+
      phases+'<p class="tiny muted">'+h(suggest.note)+'</p>';
  }
  function progressionDraft(suggest){
    if(suggest.status==='giornata_gia_conclusa')return '<p class="tiny muted">Giornata conclusa: nessuna nuova progressione da eseguire.</p>';
    const p=suggest.progression,c=p.cardio;
    const message=c.objective==='completa_volume_programmato'?'Ultima seduta '+c.previous_minutes+' min: obiettivo completare '+c.target_minutes+' min (+'+c.remaining_to_planned+' min).':c.objective==='consolida_efficienza'?'Ultima seduta '+c.previous_minutes+' min: consolida la durata e verifica efficienza a protocollo comparabile.':c.objective==='recupero'?'Giornata di recupero.':'Primo riferimento da registrare.';
    return '<div class="small-title">Progressione dallo storico</div><p class="sm">'+h(message)+'</p><p class="tiny muted">'+h(c.note)+'</p>'+
      (!loadedAt&&p.strength.length?'<p class="sm muted">Carichi privati non caricati: collega Google e aggiorna per visualizzare i riferimenti.</p>':'')+
      p.strength.map(ex=>'<div class="entry"><div class="entry-main"><strong>'+h(ex.exercise)+'</strong><small>'+h(ex.dose)+' · recupero '+h(ex.rest)+'</small>'+
      (ex.references.length?ex.references.map(r=>'<p class="tiny">'+h(r.exercise)+' · palestra '+h(r.gym)+' · '+h(r.equipment)+' · '+h(r.date)+': '+h(String(r.reference_kg))+' '+h(r.unit)+' × '+h(String(r.reference_reps))+' reps. '+(r.load_increase_allowed?'Incremento minimo disponibile condizionato.':r.conditional_target_reps===null?'Consolida/verifica prima di progredire.':'Obiettivo condizionato: '+r.conditional_target_reps+' reps allo stesso carico.')+' RIR '+(r.reference_rir??'—')+' · RPE '+(r.reference_rpe??'—')+'.'+' '+h(r.note)+'</p>').join(''):
      '<p class="tiny muted">'+(ex.status==='storico_non_comparabile'?'Storico senza identificazione attrezzo: registrare riferimento comparabile.':'Nessun riferimento comparabile disponibile.')+'</p>')+'</div></div>').join('');
  }
  async function loadCardio(){
    const meta=await googleApi('?fields=sheets.properties.title');
    const exists=meta.sheets?.some(s=>s.properties.title==='CardioSegmenti');
    if(!exists){cache.CardioSegmenti=[];cardioLoaded=true;return false;}
    const r=await googleApi('/values/'+encodeURIComponent("'CardioSegmenti'!A:O")+'?valueRenderOption=UNFORMATTED_VALUE');
    const values=r.values||[];
    if(values.length&&cardioEngine.CARDIO_HEADERS.some((k,i)=>values[0][i]!==k))throw new Error('Schema CardioSegmenti inatteso');
    cache.CardioSegmenti=parseTable(values);cardioLoaded=true;return true;
  }
  function segmentPanel(){
    let s=null;
    try{s=cardioEngine.summarizeCardioSegments(cache.CardioSegmenti,selectedDate);}catch(err){return formatWarn(err.message);}
    const next=Math.max(0,...s.rows.map(r=>r.numero_segmento))+1;
    const field=(label,name,step='1')=>'<div class="field"><label>'+label+'</label><input name="'+name+'" type="number" step="'+step+'" min="0"></div>';
    const metric=(value,suffix,complete=true)=>value===null?'—':fmtN(value,2)+suffix+(complete?'':' (parziale)');
    return '<section class="panel"><div class="panel-head"><div><h2 class="section-title">Cardio · segmenti</h2><p class="section-subtitle">Dettaglio per attività, separato dal totale del diario</p></div><button class="btn btn-quiet btn-sm" type="button" data-cut30-refresh>↻ Aggiorna</button></div>'+
      (!cardioLoaded?'<p class="sm muted">Dettaglio cloud non caricato.</p>':'<p class="sm">Totale segmenti: '+s.minutes+' min · '+metric(s.distance.value,' km',s.distance.complete)+' · '+metric(s.kcal.value,' kcal',s.kcal.complete)+' · FC media '+metric(s.hr_mean,' bpm',s.hr_coverage_minutes===s.minutes)+' (ponderata) · FC max '+metric(s.hr_max,' bpm',s.hr_max_complete)+'</p>')+
      s.rows.map(r=>'<div class="entry"><div class="entry-main"><strong>#'+r.numero_segmento+' '+h(r.modalita)+' · '+r.durata_min+' min</strong><small>'+metric(r.distanza_km,' km')+' · '+metric(r.kcal_attive,' kcal')+' · FC '+metric(r.fc_media,'')+'/'+metric(r.fc_max,' bpm')+(r.passo_sec_100m===null?'':' · '+Math.floor(r.passo_sec_100m/60)+':'+String(r.passo_sec_100m%60).padStart(2,'0')+'/100 m')+'</small></div></div>').join('')+
      '<form id="cut30-cardio-form" class="stack"><div class="form-row"><div class="field"><label>Numero segmento</label><input name="numero_segmento" type="number" min="1" max="99" value="'+next+'" required></div><div class="field"><label>Attività</label><select name="modalita">'+cardioEngine.MODES.map(m=>'<option>'+h(m)+'</option>').join('')+'</select></div>'+
      '<div class="field"><label>Durata (min)</label><input name="durata_min" type="number" step="0.1" min="0.1" max="600" required></div>'+
      field('Distanza (km)','distanza_km','0.001')+field('Velocità (km/h)','velocita_kmh','0.1')+field('Nuoto: secondi / 100 m','passo_sec_100m')+field('Tapis: pendenza (%)','pendenza_pct','0.1')+field('Calorie tracker','kcal_attive','0.1')+field('FC media (bpm)','fc_media')+field('FC max (bpm)','fc_max')+field('Passi tapis','passi_tapis')+
      '</div><button class="btn" type="submit" '+(!connected()?'disabled':'')+'>Salva segmento</button><p class="tiny muted">Lascia vuoti i dati non misurati. Per correggere un segmento usa lo stesso numero e conferma. Il riepilogo non aggiorna automaticamente Allenamenti: verifica la copertura e inserisci il totale giornaliero una sola volta.</p></form></section>';
  }
  async function submitCardio(form){
    if(!connected())throw new Error('Collega Google prima di salvare');
    const date=selectedDate,program=programFor(date);
    const rec=cardioEngine.validateCardioSegment({...Object.fromEntries(new FormData(form)),data:date,programma:program,updated_at:new Date().toISOString()});
    const exists=await loadCardio();
    if(!exists)await googleApi(':batchUpdate','POST',{requests:[{addSheet:{properties:{title:'CardioSegmenti',gridProperties:{rowCount:1000,columnCount:15,frozenRowCount:1}}}}]});
    const range="'CardioSegmenti'!A:O";
    const read='/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE';
    const before=(await googleApi(read)).values||[];
    const head=cardioEngine.CARDIO_HEADERS;
    if(before.length&&head.some((k,i)=>before[0][i]!==k))throw new Error('Schema inatteso: nessuna modifica');
    if(!before.length)await googleApi('/values/'+encodeURIComponent("'CardioSegmenti'!A1:O1")+'?valueInputOption=RAW','PUT',{values:[head]});
    const matches=before.map((r,i)=>r[0]===rec.id?i:-1).filter(i=>i>0);
    if(matches.length>1)throw new Error('ID duplicato: correggere il diario prima di salvare');
    const body={values:[head.map(k=>rec[k]??'')]};
    if(matches.length){
      if(!confirm('Sostituire il segmento #'+rec.numero_segmento+' di '+date+'?'))return;
      const n=matches[0]+1;
      const current=(await googleApi(read)).values||[];
      if(JSON.stringify(current[n-1])!==JSON.stringify(before[n-1]))throw new Error('Segmento modificato nel cloud: aggiorna prima di correggere');
      await googleApi('/values/'+encodeURIComponent("'CardioSegmenti'!A"+n+':O'+n)+'?valueInputOption=RAW','PUT',body);
    }else await googleApi('/values/'+encodeURIComponent(range)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS','POST',body);
    const after=(await googleApi(read)).values||[];
    const saved=after.filter((r,i)=>i>0&&r[0]===rec.id);
    if(saved.length!==1||head.some((k,i)=>String(saved[0][i]??'')!==String(rec[k]??'')))throw new Error('Verifica scrittura non riuscita; aggiorna prima di riprovare');
    await loadCardio();render();toast('Segmento cardio salvato e verificato');
  }
  function learningPanel(suggest){
    if(!suggest||suggest.status==='giornata_gia_conclusa')return '';
    try{
      const r=learningEngine.reviewTrainingHistory({Allenamenti:state.tables.Allenamenti,CardioSegmenti:cardioLoaded?cache.CardioSegmenti:[],Valutazioni:loadedAt?cache.Valutazioni:[]},suggest);
      return '<div class="small-title">Apprendimento adattivo · '+h(r.program)+'</div>'+
        '<p class="sm">Sedute precedenti comparabili: '+r.observations.length+' · volume sotto riferimento attuale: '+r.volume.below_reference+'/'+r.volume.observed+' · FC cardio verificabile: '+r.cardio_hr.observed+'</p>'+
        r.observations.map(o=>'<p class="tiny muted">'+h(o.date)+' · '+(o.minutes??'—')+' min · FC cardio '+(o.hr_mean_cardio??'—')+' · voto '+(o.rating??'—')+'</p>').join('')+
        r.actions.map(a=>'<p class="sm">'+h(a.text)+'</p>').join('')+'<p class="tiny muted">'+h(r.note)+'</p>';
    }catch(err){return formatWarn('Analisi storico non disponibile: '+err.message);}
  }
  async function loadPlans(){
    const meta=await googleApi('?fields=sheets.properties.title');
    const exists=meta.sheets?.some(s=>s.properties.title==='SchedeConfermate');
    if(!exists){cache.SchedeConfermate=[];window.cut30SetConfirmedPlans?.([]);planLoaded=true;return false;}
    const r=await googleApi('/values/'+encodeURIComponent("'SchedeConfermate'!A:F")+'?valueRenderOption=UNFORMATTED_VALUE');
    const values=r.values||[];
    if(values.length&&planEngine.PLAN_HEADERS.some((k,i)=>values[0][i]!==k))throw Error('Schema SchedeConfermate inatteso');
    cache.SchedeConfermate=parseTable(values);window.cut30SetConfirmedPlans?.(cache.SchedeConfermate);planLoaded=true;return true;
  }
  function currentDraft(day){
    const program=programFor(day);
    return engine.suggestTrainingDraft({Allenamenti:state.tables.Allenamenti,Carichi:cache.Carichi},day,{program,start_date:cfg('data_inizio')||'2026-11-02',exercises:/^(Upper|Lower) /.test(program)?WORKOUTS[program]:[]});
  }
  function createPlan(day){
    const d=currentDraft(day);
    const learn=learningEngine.reviewTrainingHistory({Allenamenti:state.tables.Allenamenti,CardioSegmenti:cardioLoaded?cache.CardioSegmenti:[],Valutazioni:loadedAt?cache.Valutazioni:[]},d);
    return planEngine.buildTrainingPlan(d,WORKOUTS[d.program]||[],learn);
  }
  function planPanel(suggest){
    try{
      const saved=cache.SchedeConfermate.filter(x=>x.data===selectedDate);
      if(saved.length>1)return formatWarn('Schede duplicate: verifica archivio privato.');
      const p=saved.length?planEngine.readPlanRecord(saved[0]):suggest.status==='giornata_gia_conclusa'?null:createPlan(selectedDate);
      if(!p)return '<p class="sm muted">Seduta conclusa senza scheda prospettica registrata.</p>';
      const check=planEngine.canConfirmPlan(p,localDate(),{plans:cache.SchedeConfermate,workouts:state.tables.Allenamenti,calendar:state.tables.Calendario,exercises:state.tables.Esercizi,loads:cache.Carichi,segments:cache.CardioSegmenti});
      return '<div class="small-title">'+(saved.length?'Obiettivo originale confermato':'Scheda completa · bozza')+' · '+h(p.program)+'</div>'+
        '<p class="sm">'+h(p.date)+(saved.length?' · confermata '+h(saved[0].confermato_utc):' · non ancora confermata')+' · cardio '+p.cardio.duration_min+' min · core '+p.core_minutes+' min</p>'+
        p.exercises.map(e=>'<div class="entry"><div class="entry-main"><strong>'+h(e.name)+'</strong><small>'+h(e.dose)+' · recupero '+h(e.rest)+'</small>'+e.references.map(r=>'<p class="tiny">'+h(r.gym)+' · '+h(r.equipment)+' · '+h(String(r.reference_kg??'—'))+' '+h(r.unit)+' × '+h(String(r.reference_reps??'—'))+' · '+h(r.note)+'</p>').join('')+'</div></div>').join('')+
        p.cardio.phases.map(x=>'<p class="tiny">'+h(x.label)+' · '+x.duration_min+' min · FC media '+x.target_average_hr_bpm+' bpm ('+h(x.indicative_range_bpm.join('–'))+') · '+h(x.treadmill_speed_kmh.join('–'))+' km/h · '+x.incline_pct+'%</p>').join('')+
        p.guidance.map(x=>'<p class="tiny muted">'+h(x)+'</p>').join('')+
        (saved.length?'<p class="tiny muted">Obiettivo originale non sovrascritto dal motore. Eventuali modifiche operative non riscrivono lo storico.</p>':
         '<button type="button" class="btn" data-cut30-confirm-plan '+(!connected()||!planLoaded||!loadedAt||!check.ok?'disabled':'')+'>Conferma obiettivi prima della seduta</button><p class="tiny muted">'+h(check.ok?'La conferma salva la scheda privata, non registra un allenamento. Richiede verifica cloud.':check.reason)+'</p>');
    }catch(err){return formatWarn('Scheda non disponibile: '+err.message);}
  }
  async function confirmPlan(){
    if(planSaving||!connected())return;
    planSaving=true;
    const date=selectedDate;
    try{
      // Capture what was shown before asynchronous reads, then refuse if it changed.
      const p=createPlan(date),displayed=JSON.stringify(p);
      if(!confirm('Confermi gli obiettivi per '+date+' prima di iniziare?'))return;
      const exists=await loadPlans();
      await loadCardio();
      const tabs=['Allenamenti','Calendario','Esercizi','Carichi'];
      const params=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE'});
      const end={Allenamenti:'M',Calendario:'F',Esercizi:'F',Carichi:'J'};
      tabs.forEach(t=>params.append('ranges',"'"+t+"'!A:"+end[t]));
      const remote=await googleApi('/values:batchGet?'+params.toString());
      if(remote.valueRanges?.length!==tabs.length)throw Error('Verifica cloud incompleta');
      const data=Object.fromEntries(tabs.map((t,i)=>[t,parseTable(remote.valueRanges[i].values||[])]));
      const check=planEngine.canConfirmPlan(p,localDate(),{plans:cache.SchedeConfermate,
        workouts:[...state.tables.Allenamenti,...data.Allenamenti],calendar:[...state.tables.Calendario,...data.Calendario],
        exercises:[...state.tables.Esercizi,...data.Esercizi],loads:[...cache.Carichi,...data.Carichi],segments:cache.CardioSegmenti});
      if(!check.ok)throw Error(check.reason);
      if(selectedDate!==date||JSON.stringify(createPlan(date))!==displayed)throw Error('Scheda modificata durante la verifica: aggiorna e riconferma');
      // Do not silently confirm a stale calendar override.
      const cloudOverride=data.Calendario.find(x=>x.data===date&&x.stato!=='eliminato');
      if(cloudOverride&&cloudOverride.programma!==p.program)throw Error('Calendario cloud differente: sincronizza prima');
      if(!exists)await googleApi(':batchUpdate','POST',{requests:[{addSheet:{properties:{title:'SchedeConfermate',gridProperties:{rowCount:1000,columnCount:6,frozenRowCount:1}}}}]});
      const range="'SchedeConfermate'!A:F",read='/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE';
      const before=(await googleApi(read)).values||[],head=planEngine.PLAN_HEADERS;
      if(before.length&&head.some((k,i)=>before[0][i]!==k))throw Error('Schema inatteso');
      if(before.slice(1).some(r=>r[1]===date))throw Error('Obiettivo già presente: nessuna sovrascrittura');
      if(!before.length)await googleApi('/values/'+encodeURIComponent("'SchedeConfermate'!A1:F1")+'?valueInputOption=RAW','PUT',{values:[head]});
      const rec=planEngine.makePlanRecord(p,new Date().toISOString());
      await googleApi('/values/'+encodeURIComponent(range)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS','POST',{values:[head.map(k=>rec[k])]});
      const after=(await googleApi(read)).values||[],matches=after.slice(1).filter(r=>r[1]===date);
      if(matches.length!==1||head.some((k,i)=>String(matches[0][i]??'')!==String(rec[k])))throw Error('Verifica archivio non riuscita: aggiorna prima di riprovare');
      await loadPlans();render();toast('Obiettivi confermati e verificati nel diario privato');
    }finally{planSaving=false;}
  }
  function auditPanel(){
    if(!planLoaded||!loadedAt)return '<p class="tiny muted">Aggiorna i dati privati per verificare gli obiettivi.</p>';
    try{
      const a=auditEngine.auditPerformance({SchedeConfermate:cache.SchedeConfermate,Allenamenti:state.tables.Allenamenti,Esercizi:state.tables.Esercizi,Carichi:cache.Carichi,CardioSegmenti:cardioLoaded?cache.CardioSegmenti:[]},selectedDate);
      if(a.status!=='valutato')return '<p class="tiny muted">Audit: '+h(a.reason)+'</p>';
      return '<div class="small-title">Valutazione automatica · proposta '+a.rating+'/5</div><p class="sm">'+h(a.outcome)+' · affidabilità '+h(a.confidence)+'</p>'+
        [...a.strengths,...a.issues,...a.next].map(t=>'<p class="tiny">'+h(t)+'</p>').join('')+
        '<p class="tiny muted">'+h(a.note)+'</p><button type="button" class="btn btn-quiet" data-cut30-save-audit '+(!connected()?'disabled':'')+'>Verifica e archivia audit privato</button>';
    }catch(err){return formatWarn('Audit non disponibile: '+err.message);}
  }
  async function saveAudit(){
    if(auditSaving||!connected())return;auditSaving=true;
    const date=selectedDate;
    try{
      if(!confirm('Archiviare il confronto verificato per '+date+'? Le valutazioni manuali non saranno modificate.'))return;
      if(!await loadPlans())throw Error('Scheda prospettica non disponibile');
      await loadCardio();
      const tabs=['Allenamenti','Esercizi','Carichi'];
      const params=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE'});
      const end={Allenamenti:'M',Calendario:'F',Esercizi:'F',Carichi:'J'};
      tabs.forEach(t=>params.append('ranges',"'"+t+"'!A:"+end[t]));
      const remote=await googleApi('/values:batchGet?'+params.toString());
      if(remote.valueRanges?.length!==tabs.length)throw Error('Verifica cloud incompleta');
      const data=Object.fromEntries(tabs.map((t,i)=>[t,parseTable(remote.valueRanges[i].values||[])]));
      const a=auditEngine.auditPerformance({...data,SchedeConfermate:cache.SchedeConfermate,CardioSegmenti:cache.CardioSegmenti},date);
      if(a.status!=='valutato')throw Error(a.reason);
      if(selectedDate!==date)throw Error('Data cambiata: riconferma');
      if(!confirm('Audit verificato sul cloud: '+a.rating+'/5 · '+a.outcome+'. Confermi archiviazione?'))return;
      const meta=await googleApi('?fields=sheets.properties.title');
      if(!meta.sheets?.some(s=>s.properties.title==='AuditPrestazioni'))await googleApi(':batchUpdate','POST',{requests:[{addSheet:{properties:{title:'AuditPrestazioni',gridProperties:{rowCount:1000,columnCount:8,frozenRowCount:1}}}}]});
      const range="'AuditPrestazioni'!A:H",read='/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE';
      const head=auditEngine.AUDIT_HEADERS,before=(await googleApi(read)).values||[];
      if(before.length&&head.some((k,i)=>before[0][i]!==k))throw Error('Schema audit inatteso');
      const rec=auditEngine.makeAuditRecord(a,new Date().toISOString());
      const same=before.slice(1).filter(r=>r[0]===rec.id);
      if(same.length){if(same.length===1&&same[0][7]===rec.audit_json){toast('Audit identico già archiviato');return;}throw Error('Audit già presente e differente: preservato per revisione');}
      if(!before.length)await googleApi('/values/'+encodeURIComponent("'AuditPrestazioni'!A1:H1")+'?valueInputOption=RAW','PUT',{values:[head]});
      await googleApi('/values/'+encodeURIComponent(range)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS','POST',{values:[head.map(k=>rec[k])]});
      const after=(await googleApi(read)).values||[],matches=after.slice(1).filter(r=>r[0]===rec.id);
      if(matches.length!==1||head.some((k,i)=>String(matches[0][i]??'')!==String(rec[k])))throw Error('Verifica audit non riuscita: aggiorna prima di riprovare');
      toast('Audit privato archiviato e verificato');
    }finally{auditSaving=false;}
  }
  let logEngine, guideUrl=null;
  const logDrafts=new Map(), logOpen=new Set();
  const logKey=(date,id)=>date+'|'+id;
  function logPlan(){
    try{const saved=cache.SchedeConfermate.find(x=>x.data===selectedDate);
      return saved?planEngine.readPlanRecord(saved):isDone(selectedDate)?null:createPlan(selectedDate);
    }catch{return null;}
  }
  function logExercises(){const p=logPlan();return p?.exercises||WORKOUTS[programFor(selectedDate)]||[];}
  function setRows(ex){return logEngine.matching(ex,cache.Carichi.filter(x=>x.data===selectedDate));}
  function checkedExercise(ex,date=selectedDate){return state.tables.Esercizi.some(x=>x.data===date&&x.esercizio===ex.id&&String(x.completato).toLowerCase()==='true');}
  const selectOptions=(values,selected)=>values.map(v=>'<option value="'+h(v)+'" '+(String(v)===String(selected)?'selected':'')+'>'+h(v)+'</option>').join('');
  function exerciseRow(ex,index){
    const rows=setRows(ex),past=logEngine.latestSession(ex,cache.Carichi,selectedDate);
    const count=logEngine.workingCount(ex,rows,engine.readSetEffort),complete=count>=ex.sets,manual=checkedExercise(ex),status=complete?'done':manual?'manually-checked':rows.length?'started':'todo';
    const names=logEngine.namesFor(ex),key=logKey(selectedDate,ex.id),draft=logDrafts.get(key)||{},last=past.filter(x=>logEngine.unitParts(x.unita_carico)).at(-1),unit=logEngine.unitParts(last?.unita_carico),variant=draft.esercizio||names.find(v=>logEngine.norm(v)===logEngine.norm(last?.esercizio))||names[0],guide=logEngine.guideFor(ex,variant);
    const next=logEngine.nextSet(ex,rows),timed=ex.id==='plank'||ex.muscle==='Cardio',future=selectedDate>localDate(),disabled=!connected()||!loadedAt||future;
    const val=(k,fallback='')=>h(draft[k]??fallback);
    const history=past.length?'<span class="wl-history-date">'+h(past[0].data)+'</span> '+past.map(r=>'<span class="wl-hist" title="'+h(r.unita_carico)+'">'+h(r.esercizio)+' · S'+h(r.numero_serie)+' '+h(r.carico_kg)+' kg × '+h(r.ripetizioni)+'<small>'+h(r.unita_carico||'Unità non identificata')+'</small></span>').join(' '):loadedAt?'Nessuna serie precedente':'Storico da caricare';
    const refs=(ex.references||[]).map(r=>'<span class="wl-ref">'+h(r.exercise)+' · '+h(r.unit)+' · palestra '+h(r.gym)+' · '+h(r.equipment)+': '+h(r.reference_kg??'—')+' kg × '+h(r.reference_reps??'—')+(r.conditional_target_reps==null?'':' → '+h(r.conditional_target_reps)+' reps')+'<small>'+h(r.load_increase_allowed?'Incremento minimo solo se tecnica e recupero adeguati.':r.note||'')+'</small></span>').join('');
    const image=guide?'<img class="wl-photo" src="'+h(guide.frames[0])+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">':'';
    const setList=rows.map(r=>'<button type="button" class="wl-set-chip" data-wl-edit="'+h(r.id)+'" data-wl-id="'+h(ex.id)+'" '+(timed||future?'disabled':'')+'>S'+h(r.numero_serie)+' · '+h(r.carico_kg)+' kg × '+h(r.ripetizioni)+' <small>'+h(engine.readSetEffort(r.origine).tipo_serie)+'</small></button>').join('');
    return '<article class="wl-ex wl-'+status+'" data-wl-row="'+h(ex.id)+'"><div class="wl-ex-head"><div class="wl-number">'+String(index+1).padStart(2,'0')+'</div><div class="wl-thumb">'+image+'</div><div class="wl-name"><strong>'+h(ex.name)+'</strong><small>'+h(ex.muscle)+' · recupero '+h(ex.rest)+'</small></div><button class="wl-info" type="button" data-wl-info="'+h(ex.id)+'" aria-label="Guida '+h(ex.name)+'">i</button><div class="wl-status"><b>'+h(timed?(manual?'✓':'—'):Math.min(count,ex.sets)+'/'+ex.sets)+'</b><small>'+h(complete?'Verificate':manual?'Spunta manuale':rows.length?'In corso':'Da fare')+'</small></div></div>'+
      '<div class="wl-comparison"><div><span>OBIETTIVO '+(cache.SchedeConfermate.some(x=>x.data===selectedDate)?'CONFERMATO':'PROGRAMMATO')+'</span><b>'+h(ex.dose)+'</b>'+refs+(!refs&&!timed?'<small>Carico: nessun obiettivo comparabile disponibile</small>':'')+'</div><div><span>ULTIMA REGISTRAZIONE</span><div class="wl-history">'+history+'</div></div></div>'+
      '<div class="wl-meter" aria-label="Serie allenanti verificate">'+Array.from({length:ex.sets},(_,i)=>'<i class="'+(i<count?'filled':'')+'"></i>').join('')+'</div>'+
      (setList?'<div class="wl-set-list">'+setList+'</div>':'')+
      (timed?'<label class="wl-manual"><input type="checkbox" data-exercise="'+h(ex.id)+'" '+(manual?'checked':'')+' '+(future?'disabled':'')+'> Conferma attività svolta (tempo nel diario seduta)</label>':
      '<details class="wl-entry" data-wl-details="'+h(key)+'" '+(logOpen.has(key)?'open':'')+'><summary>'+ (complete?'Modifica / aggiungi serie':'Registra serie')+' <span>＋</span></summary>'+
      '<form class="wl-set-form" data-wl-form="'+h(ex.id)+'" data-wl-date="'+h(selectedDate)+'" '+(draft.editId?'data-edit-id="'+h(draft.editId)+'"':'')+'><div class="wl-fields">'+
      '<label>Variante<select name="esercizio">'+selectOptions(names,variant)+'</select></label>'+
      '<label>Serie<input name="serie" type="number" min="1" max="25" value="'+val('serie',next??'')+'" required></label>'+
      '<label>Kg<input name="kg" inputmode="decimal" type="number" min="0" step="any" value="'+val('kg')+'" placeholder="—" required></label>'+
      '<label>Ripetizioni<input name="reps" inputmode="numeric" type="number" min="1" max="100" value="'+val('reps')+'" placeholder="—" required></label>'+
      '</div><div class="wl-fields wl-equipment"><label>Palestra<select name="palestra">'+selectOptions(['A','B'],draft.palestra||unit?.gym||'A')+'</select></label>'+
      '<label>Attrezzo<input name="attrezzo" required value="'+val('attrezzo',unit?.equipment||'')+'" placeholder="ID / nome macchina"></label>'+
      '<label>Unità<select name="unita">'+selectOptions(['kg macchina','kg per mano','kg totale'],draft.unita||unit?.type||'kg macchina')+'</select></label>'+
      '<label>Tipo serie<select name="tipo_serie">'+selectOptions(['allenante','riscaldamento','non_specificata'],draft.tipo_serie||'allenante')+'</select></label></div>'+
      '<div class="wl-fields wl-effort"><label>RIR<input name="rir" type="number" min="0" max="10" value="'+val('rir')+'" placeholder="—"></label><label>RPE<input name="rpe" type="number" min="1" max="10" step="0.5" value="'+val('rpe')+'" placeholder="—"></label></div>'+
      '<div class="wl-actions">'+(last?'<button class="btn btn-quiet" type="button" data-wl-copy="'+h(ex.id)+'">Usa ultima serie</button>':'')+'<button class="btn" type="submit" '+(disabled?'disabled':'')+'>Salva serie</button></div>'+
      '<p class="tiny muted">'+(future?'Non puoi registrare una prestazione futura.':disabled?'Connetti Google e aggiorna lo storico prima di registrare.':'I valori sono registrati soltanto dopo il salvataggio verificato.')+'</p></form></details>'+
      '<label class="wl-manual"><input type="checkbox" data-exercise="'+h(ex.id)+'" '+(manual?'checked':'')+' '+(future||complete?'disabled':'')+'> Spunta manuale (non sostituisce le serie verificate)</label>')+'</article>';
  }
  function trainingPanel(){
    const program=programFor(selectedDate),suggest=currentDraft(selectedDate),ex=logExercises(),done=ex.filter(x=>checkedExercise(x)||logEngine.workingCount(x,setRows(x),engine.readSetEffort)>=x.sets).length;
    return '<section class="panel wl-shell"><div class="wl-heading"><div><span class="wl-kicker">CUT30 / TRAINING LOG</span><h2>'+h(program)+'</h2><p>'+h(dayLabel(selectedDate,{weekday:'long',day:'numeric',month:'long'}))+' · '+(isDone(selectedDate)?'Seduta conclusa':'Sessione da svolgere')+'</p></div><div class="wl-count"><b>'+done+'/'+ex.length+'</b><small>ESERCIZI</small></div></div>'+
      '<div class="progress wl-session-progress"><span style="width:'+(ex.length?done/ex.length*100:0)+'%"></span></div><div class="wl-toolbar"><span>Serie verificate · storico privato</span><button type="button" class="btn btn-quiet btn-sm" data-cut30-refresh>↻ Aggiorna</button></div>'+
      '<details class="wl-plan"><summary>Obiettivi, conferma scheda e audit</summary>'+planPanel(suggest)+auditPanel()+'</details>'+
      '<div class="wl-list">'+ex.map(exerciseRow).join('')+'</div><button class="btn wl-finish" data-action="finish-training" '+(selectedDate>localDate()?'disabled':'')+'>'+(isDone(selectedDate)?'Aggiorna sessione':'Concludi allenamento')+'</button></section>';
  }
  function closeGuide(){const d=document.querySelector('#wl-guide');if(d)d.close();if(guideUrl){URL.revokeObjectURL(guideUrl);guideUrl=null;}d?.remove();}
  function openGuide(ex){
    closeGuide();const row=document.querySelector('[data-wl-row="'+ex.id+'"]'),variant=row?.querySelector('[name="esercizio"]')?.value||logEngine.namesFor(ex)[0],g=logEngine.guideFor(ex,variant);if(!g)return;
    const d=document.createElement('dialog');d.id='wl-guide';d.className='wl-guide';
    d.innerHTML='<div class="wl-guide-head"><div><span class="wl-kicker">TECNICA / '+h(ex.muscle)+'</span><h2>'+h(variant)+'</h2></div><button type="button" class="wl-info" data-wl-close aria-label="Chiudi guida">×</button></div>'+
      '<div class="wl-demo"><img src="'+h(g.frames[0])+'" alt="Posizione iniziale" referrerpolicy="no-referrer"><img src="'+h(g.frames[1])+'" alt="Posizione finale" referrerpolicy="no-referrer"><img class="wl-gif" alt="Dimostrazione GIF" hidden></div><small class="wl-demo-caption">Due posizioni dimostrative, non una ripresa continua. <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener noreferrer">Fonte foto</a>.</small>'+
      '<h3>Muscoli e obiettivo</h3><p>'+h(g.muscle)+' · '+h(ex.dose)+'</p><h3>Come eseguirlo</h3><p>'+h(g.technique)+'</p><h3>Come capire se lo fai bene</h3><p>'+h(g.feel)+'</p><h3>Recupero</h3><p>'+h(ex.rest)+'. Interrompi in caso di dolore acuto o perdita di controllo.</p>';
    document.body.append(d);d.addEventListener('close',()=>{if(document.querySelector('#wl-guide')===d){d.remove();if(guideUrl){URL.revokeObjectURL(guideUrl);guideUrl=null;}}});d.showModal();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)logEngine.photoGif(g.frames).then(url=>{if(!d.isConnected){URL.revokeObjectURL(url);return;}guideUrl=url;const img=d.querySelector('.wl-gif');img.src=url;img.hidden=false;d.querySelector('.wl-demo').classList.add('gif-ready');}).catch(()=>{});
  }
  function captureLog(form){if(!form?.dataset.wlForm)return;logDrafts.set(logKey(form.dataset.wlDate,form.dataset.wlForm),{...Object.fromEntries(new FormData(form)),editId:form.dataset.editId||''});}
  function fillLog(ex,rec,edit){
    const row=document.querySelector('[data-wl-row="'+ex.id+'"]'),form=row?.querySelector('form');if(!form||!rec)return;
    const unit=logEngine.unitParts(rec.unita_carico);if(!unit){toast('Storico senza attrezzo identificato: registra un nuovo riferimento.');return;}
    const effort=engine.readSetEffort(rec.origine),values={esercizio:logEngine.namesFor(ex).find(v=>logEngine.norm(v)===logEngine.norm(rec.esercizio))||rec.esercizio,kg:rec.carico_kg,reps:rec.ripetizioni,palestra:unit.gym,attrezzo:unit.equipment,unita:unit.type,tipo_serie:edit?effort.tipo_serie:'allenante',rir:edit?effort.rir??'':'',rpe:edit?effort.rpe??'':''};
    if(edit)values.serie=rec.numero_serie;
    for(const [k,v] of Object.entries(values))if(form.elements[k])form.elements[k].value=v;
    if(edit)form.dataset.editId=rec.id;else delete form.dataset.editId;
    row.querySelector('details').open=true;captureLog(form);form.elements.kg.focus();
  }
  function ingredientRow(){
    return '<div class="cut30-ingredient-row form-row" style="margin:8px 0">'+
      '<div class="field"><label>Ingrediente</label><input name="name" required placeholder="Es. pasta secca"></div>'+
      '<div class="field"><label>g a crudo</label><input name="raw_g" type="number" step="0.1" min="0.1" required></div>'+
      '<div class="field"><label>kcal/100g</label><input name="kcal" type="number" step="0.1" min="0" required></div>'+
      '<div class="field"><label>Proteine/100g</label><input name="proteine" type="number" step="0.1" min="0" required></div>'+
      '<div class="field"><label>Carboidrati/100g</label><input name="carboidrati" type="number" step="0.1" min="0" required></div>'+
      '<div class="field"><label>Grassi/100g</label><input name="grassi" type="number" step="0.1" min="0" required></div>'+
      '<div class="field"><label>Fibre/100g</label><input name="fibre" type="number" step="0.1" min="0" required></div>'+
      '</div>';
  }
  function recipePanel(){
    return '<section class="panel cut30-engine"><div class="panel-head"><div><h2 class="section-title">Calcolatore ricetta · CUT30 Engine</h2><p class="section-subtitle">Da ingredienti pesati a crudo a porzione cotta</p></div></div>'+
      '<form id="cut30-recipe-form" class="stack"><div class="form-row">'+
      '<div class="field"><label>Nome ricetta</label><input name="recipe_name" required placeholder="Es. Pasta nasello e piselli"></div>'+
      '<div class="field"><label>Pasto</label><select name="meal"><option>Pranzo</option><option>Cena</option><option>Colazione</option><option>Spuntino</option></select></div>'+
      '<div class="field"><label>Peso totale COTTO (g)</label><input name="yield_g" type="number" min="0.1" step="0.1" placeholder="Se non misurato, lascia vuoto"></div>'+
      '<div class="field"><label>Porzione COTTA consumata (g)</label><input name="serving_g" type="number" min="0.1" step="0.1" required></div></div>'+
      '<div id="cut30-recipe-ingredients">'+ingredientRow()+ingredientRow()+'</div>'+
      '<div class="row wrap"><button type="button" class="btn btn-outline" data-cut30-add-ingredient>Aggiungi ingrediente</button><button class="btn btn-quiet" type="submit">Calcola porzione</button><button type="button" class="btn" data-cut30-save-recipe disabled>Registra pasto confermato</button></div>'+
      '<div id="cut30-recipe-result" class="warning-note">Il peso della sola porzione non consente un calcolo esatto se manca il peso totale cotto della ricetta.</div>'+
      '<p class="tiny muted">Inserisci per ogni ingrediente i valori per 100 g da etichetta o fonte affidabile. Le calorie dell’olio vanno incluse come ingrediente separato. Nessun dato viene salvato al solo calcolo.</p></form></section>';
  }
  function renderAddon(){
    if(!document.querySelector('#app') || !engine)return;
    const root=document.querySelector('#app');
    if(currentPage==='progress')root.insertAdjacentHTML('afterbegin',summary()+latestLoads());
    if(currentPage==='training'){const old=root.querySelector('.training-list')?.closest('.panel');if(old)old.outerHTML=trainingPanel();else root.insertAdjacentHTML('afterbegin',trainingPanel());root.insertAdjacentHTML('beforeend',segmentPanel());}
    if(currentPage==='nutrition')root.insertAdjacentHTML('afterbegin',recipePanel());
  }
  function slug(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'esercizio';}
  async function saveRow(table,rec,expected=null){
    if(!connected())throw new Error('Account Google non collegato o sessione scaduta');
    const head=headers[table];
    const url="/values/"+encodeURIComponent("'"+table+"'!A:"+String.fromCharCode(64+head.length))+"?valueRenderOption=UNFORMATTED_VALUE";
    const data=await googleApi(url);
    const values=data.values||[];
    if(!values.length || head.some((x,i)=>String(values[0][i]||'')!==x))throw new Error('Schema inatteso: '+table+'. Nessuna modifica eseguita.');
    const matches=values.map((r,i)=>i>0&&String(r[0])===rec.id?i:-1).filter(i=>i>0);
    if(matches.length>1)throw new Error('ID duplicato: riconciliare prima di scrivere');
    const previous=matches[0]??-1;
    if(table==='Carichi'&&previous>0&&(!expected||head.some((k,i)=>String(values[previous][i]??'')!==String(expected[k]??''))))throw new Error('Serie già presente o modificata nel cloud: aggiorna prima di correggere.');
    if(table==='Carichi'&&expected&&previous<0)throw new Error('Serie originale non più disponibile: aggiorna il diario.');
    if(table==='Carichi' && previous<0){
      const conflict=values.find((r,i)=>i>0 && String(r[1])===rec.data &&
        slug(String(r[3]||''))===slug(rec.esercizio) && Number(r[4])===rec.numero_serie);
      if(conflict)throw new Error('Questa serie risulta già presente (ID '+String(conflict[0])+'). Evito il duplicato: correggi quella registrazione o richiedi una seconda sessione.');
    }
    const body={values:[head.map(k=>rec[k]??'')]};
    if(previous>0){
      const row=previous+1,range="'"+table+"'!A"+row+":"+String.fromCharCode(64+head.length)+row;
      await googleApi('/values/'+encodeURIComponent(range)+'?valueInputOption=RAW','PUT',body);
    }else{
      await googleApi('/values/'+encodeURIComponent("'"+table+"'!A:"+String.fromCharCode(64+head.length))+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS','POST',body);
    }
    const after=await googleApi(url);
    const verified=(after.values||[]).filter((r,i)=>i>0&&r[0]===rec.id);
    if(verified.length!==1)throw new Error('Verifica record non univoca: aggiorna il diario');
    const saved=verified[0];
    if(!saved)throw new Error('Scrittura inviata ma verifica del record non riuscita');
    const mismatch=head.some((key,index)=>String(saved[index]??'')!==String(rec[key]??''));
    if(mismatch)throw new Error('Il record esiste ma alcuni valori non coincidono: aggiorna il diario prima di riprovare.');
    return saved;
  }
  let setSaving=false;
  async function submitSet(form){
    if(setSaving)throw Error('Una serie è già in salvataggio.');
    const date=form.dataset.wlDate,ex=logExercises().find(x=>x.id===form.dataset.wlForm),program=logPlan()?.program||programFor(date);
    if(!ex||program!==programFor(date)||date!==selectedDate||date>localDate()||!connected()||!loadedAt)throw Error('Data, esercizio o connessione non validi.');
    const data=new FormData(form),exercise=String(data.get('esercizio')||'').trim();
    const number=Number(data.get('serie')),kg=Number(data.get('kg')),reps=Number(data.get('reps'));
    if(!logEngine.namesFor(ex).includes(exercise)||String(data.get('kg')??'').trim()===''||!Number.isInteger(number)||number<1||number>25||!Number.isFinite(kg)||kg<0||!Number.isInteger(reps)||reps<1||reps>100)throw Error('Serie/carico/ripetizioni non validi.');
    const gym=String(data.get('palestra')),eq=String(data.get('attrezzo')||'').trim(),type=String(data.get('unita'));
    if(!eq||!['A','B'].includes(gym)||!['kg macchina','kg per mano','kg totale'].includes(type))throw Error('Indica palestra, attrezzo e unità.');
    const unit=type+' | palestra '+gym+' | attrezzo '+eq;
    const before=logEngine.workingCount(ex,setRows(ex),engine.readSetEffort);
    const canonical='s-'+date.replaceAll('-','')+'-'+slug(exercise)+'-'+slug(gym+'-'+eq)+'-'+number;
    const existing=cache.Carichi.find(x=>x.id===form.dataset.editId);
    if(existing&&(existing.data!==date||logEngine.norm(existing.esercizio)!==logEngine.norm(exercise)||Number(existing.numero_serie)!==number||existing.unita_carico!==unit))throw Error('Per correggere una serie mantieni variante, palestra, attrezzo e numero originali.');
    const same=cache.Carichi.find(x=>x.id===canonical);
    if(!existing&&same)throw Error('Serie già presente: seleziona la serie registrata per modificarla.');
    if(existing&&!confirm('Confermi la correzione della serie '+number+'?'))return;
    const rec={id:existing?.id||canonical,data:date,programma:program,esercizio:existing?.esercizio||exercise,numero_serie:number,carico_kg:kg,ripetizioni:reps,unita_carico:unit,
      origine:engine.encodeSetEffort('Confermato da utente PWA CUT30 Engine. Kg dichiarati, non confrontare macchine differenti.',{tipo_serie:data.get('tipo_serie'),rir:data.get('rir'),rpe:data.get('rpe')}),updated_at:new Date().toISOString()};
    setSaving=true;
    try{
      await saveRow('Carichi',rec,existing||null);
      cache.Carichi=cache.Carichi.filter(x=>x.id!==rec.id).concat(rec);
      window.cut30SetLoadEvidence?.(cache.Carichi,Date.now(),state.prefs.sheetId);
      const after=logEngine.workingCount(ex,logEngine.matching(ex,cache.Carichi.filter(x=>x.data===date)),engine.readSetEffort);
      if(after>=ex.sets||before>=ex.sets&&after<ex.sets)upsert('Esercizi',{id:'e-'+date+'-'+ex.id,data:date,programma:program,esercizio:ex.id,completato:after>=ex.sets?'true':'false',updated_at:now()});
      const key=logKey(date,ex.id);logDrafts.set(key,{esercizio:exercise,palestra:gym,attrezzo:eq,unita:type,tipo_serie:data.get('tipo_serie')});logOpen.add(key);
      toast('Serie salvata e verificata sul Google Sheet privato');render();await refreshCloud(true);
    }finally{setSaving=false;}
  }
  function computeRecipe(form){
    const info=new FormData(form);
    const ingredients=[...form.querySelectorAll('.cut30-ingredient-row')].map(r=>{
      const get=k=>r.querySelector('[name="'+k+'"]').value;
      const per100={};['kcal','proteine','carboidrati','grassi','fibre'].forEach(k=>per100[k]=Number(get(k)));
      return {name:get('name').trim(),raw_g:Number(get('raw_g')),per100};
    });
    const r=recipeEngine.calculateRecipe({
      ingredients,cooked_yield_g:Number(info.get('yield_g'))||null,
      serving_cooked_g:Number(info.get('serving_g'))||null
    });
    currentRecipe={result:r,name:String(info.get('recipe_name')||'').trim(),meal:String(info.get('meal')),date:selectedDate};
    const label=form.querySelector('#cut30-recipe-result'),save=form.querySelector('[data-cut30-save-recipe]');
    if(!r.serving){label.textContent=r.warning;save.disabled=true;return;}
    label.textContent='Porzione '+r.serving_cooked_g+' g: '+fmtN(r.serving.kcal)+' kcal; proteine '+fmtN(r.serving.proteine,1)+' g; carboidrati '+fmtN(r.serving.carboidrati,1)+' g; grassi '+fmtN(r.serving.grassi,1)+' g. Calcolo condizionato alla resa cotta.';
    save.disabled=!connected();
  }
  async function saveRecipe(form){
    if(!currentRecipe?.result?.serving)throw new Error('Calcola prima la porzione completa');
    const {name,meal,date,result:r}=currentRecipe;
    if(date!==selectedDate)throw new Error('Data modificata: ricalcola prima di registrare');
    const rec={
      id:form.dataset.recordId || (form.dataset.recordId='n-'+date.replaceAll('-','')+'-ricetta-'+Date.now().toString(36)),
      data:date,pasto:meal,alimento:name,quantita:r.serving_cooked_g,unita:'g',
      kcal:r.serving.kcal,proteine:r.serving.proteine,carboidrati:r.serving.carboidrati,
      grassi:r.serving.grassi,fibre:r.serving.fibre,
      qualita:'calcolato da ricetta; ingredienti dichiarati e resa cotta confermata; fonte macro input utente',
      updated_at:new Date().toISOString()
    };
    await saveRow('Nutrizione',rec);
    // Update current local view without rewriting it to Google. Sync remains user-controlled.
    const ix=state.tables.Nutrizione.findIndex(x=>x.id===rec.id);
    if(ix<0)state.tables.Nutrizione.push(rec);
    save();
    currentRecipe=null;
    toast('Porzione registrata nel database privato');
    render();
  }
  function onSubmit(e){
    if(!e.target.dataset.wlForm&&!['cut30-recipe-form','cut30-cardio-form'].includes(e.target.id))return;
    e.preventDefault();e.stopImmediatePropagation();
    const form=e.target;
    if(form.dataset.pending==='1')return;
    form.dataset.pending='1';
    const task=form.dataset.wlForm?submitSet(form):form.id==='cut30-cardio-form'?submitCardio(form):Promise.resolve().then(()=>computeRecipe(form));
    Promise.resolve(task).catch(err=>{toast('CUT30 Engine: '+err.message);console.error('CUT30 Engine input:',err.message);}).finally(()=>{form.dataset.pending='0';});
  }
  function onInput(e){
    const log=e.target.closest('.wl-set-form');if(log){captureLog(log);return;}
    const form=e.target.closest('#cut30-recipe-form');
    if(!form)return;
    currentRecipe=null;
    const button=form.querySelector('[data-cut30-save-recipe]');
    if(button)button.disabled=true;
    if(form.dataset.recordId)delete form.dataset.recordId;
    const result=form.querySelector('#cut30-recipe-result');
    if(result)result.textContent='Dati modificati: ricalcola la porzione prima di registrarla.';
  }
  function onClick(e){
    const close=e.target.closest('[data-wl-close]');if(close){closeGuide();return;}
    const info=e.target.closest('[data-wl-info]');if(info){const ex=logExercises().find(x=>x.id===info.dataset.wlInfo);if(ex)openGuide(ex);return;}
    const edit=e.target.closest('[data-wl-edit]');if(edit){const ex=logExercises().find(x=>x.id===edit.dataset.wlId);if(ex)fillLog(ex,cache.Carichi.find(x=>x.id===edit.dataset.wlEdit),true);return;}
    const copy=e.target.closest('[data-wl-copy]');if(copy){const ex=logExercises().find(x=>x.id===copy.dataset.wlCopy);if(ex)fillLog(ex,logEngine.latestSession(ex,cache.Carichi,selectedDate).filter(r=>logEngine.unitParts(r.unita_carico)).at(-1),false);return;}
    if(e.target.closest('[data-cut30-save-audit]')){e.preventDefault();saveAudit().catch(err=>toast('Audit: '+err.message));return;}
    if(e.target.closest('[data-cut30-confirm-plan]')){e.preventDefault();confirmPlan().catch(err=>toast('Conferma scheda: '+err.message));return;}
    if(e.target.closest('[data-cut30-refresh]')){e.preventDefault();refreshCloud();return;}
    if(e.target.closest('[data-cut30-add-ingredient]')){
      e.preventDefault();
      const container=document.querySelector('#cut30-recipe-ingredients');
      if(container && container.children.length<20)container.insertAdjacentHTML('beforeend',ingredientRow());
      currentRecipe=null;
      const save=document.querySelector('[data-cut30-save-recipe]');if(save)save.disabled=true;
      return;
    }
    if(e.target.closest('[data-cut30-save-recipe]')){
      e.preventDefault();
      const form=e.target.closest('form');
      if(form.dataset.pending==='1')return;
      form.dataset.pending='1';e.target.disabled=true;
      saveRecipe(form).catch(err=>{toast('Salvataggio ricetta non riuscito: '+err.message);console.error('CUT30 recipe:',err.message);e.target.disabled=false;}).finally(()=>{form.dataset.pending='0';});
    }
  }
  async function init(){
    try{
      [engine,recipeEngine,cardioEngine,learningEngine,planEngine,auditEngine]=await Promise.all([import('./engine/cut30.mjs'),import('./engine/recipes.mjs'),import('./engine/cardio-segments.mjs'),import('./engine/learning.mjs'),import('./engine/training-plan.mjs'),import('./engine/performance-audit.mjs')]);
      logEngine=await import('./engine/workout-log.mjs');
      const originalRender=render;
      render=function(){const result=originalRender();if(result!==false)renderAddon();return result;};
      document.addEventListener('submit',onSubmit,true);
      document.addEventListener('click',onClick);
      document.addEventListener('input',onInput);
      document.addEventListener('change',onInput);
      document.addEventListener('toggle',e=>{const key=e.target.dataset?.wlDetails;if(key){if(e.target.open)logOpen.add(key);else logOpen.delete(key);}},true);
      render();
      setTimeout(()=>refreshCloud(true),1000);
      setInterval(()=>{if(document.visibilityState==='visible'&&connected()&&Date.now()-loadedAt>300000)refreshCloud(true);},90000);
    }catch(err){console.error('CUT30 Engine unable to load:',err);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
