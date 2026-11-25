/* CUT30 Engine Bridge — additive UI. Does not change the legacy PWA full-sheet sync.
   Carichi, Valutazioni and AnalisiAuto remain exclusively in private Google Sheets.
   Only explicit form submissions write a single identified row. */
(function cut30EngineBridge(){
  'use strict';
  let engine=null, recipeEngine=null, cardioEngine=null, cardioLoaded=false, busy=false, loadedAt=0, currentRecipe=null;
  const cache={Carichi:[],Valutazioni:[],AnalisiAuto:[],CardioSegmenti:[]};
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
    try{
      const params=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE'});
      ['Carichi','Valutazioni','AnalisiAuto'].forEach(x=>params.append('ranges',"'"+x+"'!A1:P4000"));
      // AnalisiAuto might not exist before the first server-side job.
      let result;
      try{result=await googleApi('/values:batchGet?'+params.toString());}
      catch(e){
        const fallback=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE'});
        ['Carichi','Valutazioni'].forEach(x=>fallback.append('ranges',"'"+x+"'!A1:P4000"));
        result=await googleApi('/values:batchGet?'+fallback.toString());
        cache.AnalisiAuto=[];
      }
      cache.Carichi=parseTable(result.valueRanges?.[0]?.values||[]);
      cache.Valutazioni=parseTable(result.valueRanges?.[1]?.values||[]);
      if(result.valueRanges?.[2])cache.AnalisiAuto=parseTable(result.valueRanges[2].values||[]);
      try{await loadCardio();}catch(err){cardioLoaded=false;cache.CardioSegmenti=[];console.warn('Cardio detail unavailable');}
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
  function trainingPanel(){
    const program=programFor(selectedDate);
    const suggest=engine?engine.suggestTrainingDraft({Allenamenti:state.tables.Allenamenti,Carichi:cache.Carichi},selectedDate,{program,start_date:cfg('data_inizio')||'2026-11-02',exercises:/^(Upper|Lower) /.test(program)?WORKOUTS[program]:[]}):null;
    const mySets=cache.Carichi.filter(r=>r.data===selectedDate);
    return '<section class="panel cut30-engine"><div class="panel-head"><div><h2 class="section-title">CUT30 Engine · Serie e carichi</h2><p class="section-subtitle">Salvataggio puntuale su Google Sheets, senza riscrivere il diario</p></div><button type="button" class="btn btn-quiet btn-sm" data-cut30-refresh>↻ Aggiorna</button></div>'+
      (suggest?cardioDraft(suggest)+progressionDraft(suggest):'')+
      '<form id="cut30-set-form" class="stack"><div class="form-row">'+
      '<div class="field"><label>Esercizio</label><input name="esercizio" required placeholder="Es. Leg press"></div>'+
      '<div class="field"><label>Numero serie</label><input name="serie" type="number" min="1" max="25" value="1" required></div>'+
      '<div class="field"><label>Carico (kg dichiarati)</label><input name="kg" type="number" min="0" step="0.25" required></div>'+
      '<div class="field"><label>Ripetizioni</label><input name="reps" type="number" min="1" max="100" required></div>'+
      '<div class="field"><label>Tipo serie</label><select name="tipo_serie"><option value="non_specificata">Non specificata</option><option value="allenante">Allenante</option><option value="riscaldamento">Riscaldamento</option></select></div>'+
      '<div class="field"><label>RIR (ripetizioni in riserva)</label><input name="rir" type="number" min="0" max="10" step="1" placeholder="Facoltativo"></div>'+
      '<div class="field"><label>RPE (sforzo percepito serie)</label><input name="rpe" type="number" min="1" max="10" step="0.5" placeholder="Facoltativo"></div>'+
      '<div class="field"><label>Palestra</label><select name="palestra"><option value="A">Palestra A · con piscina</option><option value="B">Palestra B · senza piscina</option></select></div>'+
      '<div class="field"><label>Attrezzo (identificativo)</label><input name="attrezzo" required placeholder="Es. leg-press-45"></div>'+
      '<div class="field"><label>Tipo peso</label><select name="unita"><option value="kg macchina">kg macchina</option><option value="kg per mano">kg per mano</option><option value="kg totale">kg totale</option></select></div></div>'+
      '<button type="submit" class="btn" '+(!connected()?'disabled':'')+'>Registra serie confermata</button>'+
      '<p class="tiny muted">La data usata è '+h(selectedDate)+'. Questa registrazione non chiude l’allenamento. '+(!connected()?'Per scrivere serve connettere Google nelle Impostazioni.':'')+'</p></form>'+
      '<div class="small-title">Serie registrate nel cloud per questo giorno: '+mySets.length+'</div>'+
      mySets.slice(-12).map(x=>'<p class="tiny muted">'+h(x.esercizio)+' · '+h(String(x.carico_kg))+' kg × '+h(String(x.ripetizioni))+' · S'+h(String(x.numero_serie))+'</p>').join('')+
      '</section>';
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
    if(currentPage==='training')root.insertAdjacentHTML('afterbegin',trainingPanel()+segmentPanel());
    if(currentPage==='nutrition')root.insertAdjacentHTML('afterbegin',recipePanel());
  }
  function slug(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'esercizio';}
  async function saveRow(table,rec){
    if(!connected())throw new Error('Account Google non collegato o sessione scaduta');
    const head=headers[table];
    const url="/values/"+encodeURIComponent("'"+table+"'!A1:P4000")+"?valueRenderOption=UNFORMATTED_VALUE";
    const data=await googleApi(url);
    const values=data.values||[];
    if(!values.length || head.some((x,i)=>String(values[0][i]||'')!==x))throw new Error('Schema inatteso: '+table+'. Nessuna modifica eseguita.');
    const previous=values.findIndex((r,i)=>i>0&&String(r[0])===rec.id);
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
    const saved=(after.values||[]).find((r,i)=>i>0&&r[0]===rec.id);
    if(!saved)throw new Error('Scrittura inviata ma verifica del record non riuscita');
    const mismatch=head.some((key,index)=>String(saved[index]??'')!==String(rec[key]??''));
    if(mismatch)throw new Error('Il record esiste ma alcuni valori non coincidono: aggiorna il diario prima di riprovare.');
    return saved;
  }
  async function submitSet(form){
    const data=new FormData(form);
    const exercise=String(data.get('esercizio')||'').trim();
    const number=Number(data.get('serie')),kg=Number(data.get('kg')),reps=Number(data.get('reps'));
    if(!exercise||!Number.isInteger(number)||number<1||number>25||!Number.isFinite(kg)||kg<0||!Number.isInteger(reps)||reps<1||reps>100)throw new Error('Serie/carico/ripetizioni non validi.');
    const gym=String(data.get('palestra')),eq=String(data.get('attrezzo')||'').trim();
    if(!eq)throw new Error('Indica la macchina per evitare confronti tra palestre diverse');
    const type=String(data.get('unita'));
    const unit=type+' | palestra '+gym+' | attrezzo '+eq;
    const rec={
      id:'s-'+selectedDate.replaceAll('-','')+'-'+slug(exercise)+'-'+slug(gym+'-'+eq)+'-'+number,
      data:selectedDate,programma:programFor(selectedDate),esercizio:exercise,numero_serie:number,
      carico_kg:kg,ripetizioni:reps,unita_carico:unit,
      origine:engine.encodeSetEffort('Confermato da utente PWA CUT30 Engine. Kg dichiarati, non confrontare macchine differenti.',{tipo_serie:data.get('tipo_serie'),rir:data.get('rir'),rpe:data.get('rpe')}),
      updated_at:new Date().toISOString()
    };
    await saveRow('Carichi',rec);
    toast('Serie salvata e verificata sul Google Sheet privato');
    await refreshCloud(true);
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
    if(!['cut30-set-form','cut30-recipe-form','cut30-cardio-form'].includes(e.target.id))return;
    e.preventDefault();e.stopImmediatePropagation();
    const form=e.target;
    if(form.dataset.pending==='1')return;
    form.dataset.pending='1';
    const task=form.id==='cut30-set-form'?submitSet(form):form.id==='cut30-cardio-form'?submitCardio(form):Promise.resolve().then(()=>computeRecipe(form));
    Promise.resolve(task).catch(err=>{toast('CUT30 Engine: '+err.message);console.error('CUT30 Engine input:',err.message);}).finally(()=>{form.dataset.pending='0';});
  }
  function onInput(e){
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
      [engine,recipeEngine,cardioEngine]=await Promise.all([import('./engine/cut30.mjs'),import('./engine/recipes.mjs'),import('./engine/cardio-segments.mjs')]);
      const originalRender=render;
      render=function(){const result=originalRender();if(result!==false)renderAddon();return result;};
      document.addEventListener('submit',onSubmit,true);
      document.addEventListener('click',onClick);
      document.addEventListener('input',onInput);
      render();
      setTimeout(()=>refreshCloud(true),1000);
      setInterval(()=>{if(document.visibilityState==='visible'&&connected()&&Date.now()-loadedAt>300000)refreshCloud(true);},90000);
    }catch(err){console.error('CUT30 Engine unable to load:',err);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
