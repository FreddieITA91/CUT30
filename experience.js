(function cut30Experience(){
  "use strict";
  const AXES=[{id:"steps",label:"Passi",short:"Passi"},{id:"exercises",label:"Esercizi confermati",short:"Esercizi"},{id:"duration",label:"Tempo attività",short:"Tempo"},{id:"cardio",label:"Cardio",short:"Cardio"},{id:"consistency",label:"Costanza",short:"Costanza"}];
  const bound=(v,lo=0,hi=100)=>Math.min(hi,Math.max(lo,Number(v)||0));
  const tFmt=(v,d=0)=>Number(v||0).toLocaleString("it-IT",{maximumFractionDigits:d,minimumFractionDigits:d});
  const dayData=(key,day)=>state.tables[key].filter(x=>x.data===day);
  const isTraining=x=>x&&x.stato==="completato";
  const uniqueCompleted=()=>{const m=new Map();for(const x of state.tables.Allenamenti.filter(isTraining))m.set(x.data,x);return[...m.values()]};
  const lastDays=(count=7)=>Array.from({length:count},(_,i)=>shiftDate(localDate(),i-count+1));
  const mSteps=()=>{const map=new Map();for(const x of state.tables.Misure||[])if(n(x.passi_giornalieri)>0)map.set(x.data,Math.max(n(x.passi_giornalieri),n(map.get(x.data))));return map};
  let trackerEngine=null,selectedPeriod="week",confirmedPlans=[],loadEvidence={rows:[],available:false,sheetId:null,at:0,status:'idle',error:''},loadFlight=null;
  let loadModule=null;
  window.cut30SetConfirmedPlans=rows=>{confirmedPlans=Array.isArray(rows)?rows:[];};
  window.cut30SetLoadEvidence=(rows,at,sheetId)=>{
    if(sheetId!==state.prefs?.sheetId||!Array.isArray(rows))return;
    if(loadEvidence.sheetId===sheetId&&loadEvidence.at>at)return;
    loadEvidence={rows,available:true,sheetId,at,status:'ready',error:''};levelCache=null;
  };
  function redrawCoverage(){if(['dashboard','progress'].includes(currentPage)&&trackerEngine)render();}
  async function loadMuscleHistory({interactive=false,force=false}={}){
    const sheetId=state.prefs?.sheetId;
    if(!token||Date.now()>tokenExpires-30000){
      loadEvidence={...(loadEvidence.sheetId===sheetId?loadEvidence:{rows:[],available:false,at:0}),sheetId,status:'disconnected',error:'Accesso Google non attivo'};
      redrawCoverage();
      if(interactive)connectGoogle();
      return null;
    }
    if(loadFlight?.sheetId===sheetId)return loadFlight.promise;
    if(!force&&loadEvidence.sheetId===sheetId&&loadEvidence.available&&Date.now()-loadEvidence.at<60000)return loadEvidence.rows;
    const previous=loadEvidence.sheetId===sheetId?loadEvidence:{rows:[],available:false,at:0},started=Date.now();
    loadEvidence={...previous,sheetId,status:'loading',error:''};
    redrawCoverage();
    const promise=(async()=>{
      try{
        const mod=await (loadModule??=import('./engine/load-evidence.mjs'));
        let timeout;let rows;
        try{rows=await Promise.race([mod.readLoads(googleApi),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Tempo di lettura Carichi scaduto: riprova')),15000);})]);}finally{clearTimeout(timeout);}
        if(sheetId!==state.prefs?.sheetId)return null;
        // A save verified while the read was in flight is newer evidence.
        if(loadEvidence.sheetId===sheetId&&loadEvidence.at>started)return loadEvidence.rows;
        window.cut30SetLoadEvidence(rows,Date.now(),sheetId);
        return rows;
      }catch(err){
        if(sheetId===state.prefs?.sheetId&&loadEvidence.at<=started){
          loadEvidence={...previous,sheetId,status:!token?'disconnected':'error',error:String(err?.message||err).slice(0,180)};
          loadModule=null;
          if(interactive)toast('Carichi: '+loadEvidence.error);
        }
        return null;
      }finally{if(loadFlight?.sheetId===sheetId)loadFlight=null;redrawCoverage();}
    })();
    loadFlight={sheetId,promise};return promise;
  }
  window.cut30RefreshLoadEvidence=()=>loadMuscleHistory({force:true});
  function aggregates(period=selectedPeriod){
    if(!trackerEngine)return null;
    return trackerEngine.buildPeriodTracker({today:localDate(),period,tables:state.tables,confirmedPlans,loadEvidence:loadEvidence.sheetId===state.prefs?.sheetId?loadEvidence:{rows:[],available:false},programFor,targetsFor,stepsGoal:n(cfg("passi_giorno"))||12000,weeklyCardioGoal:n(cfg("obiettivo_cardio_sett"))||300});
  }
  const display=(v,unit='')=>v===null||v===undefined?'—':tFmt(v,Number.isInteger(v)?0:1)+unit;
  const periodLabel=a=>a.period==='day'?'Oggi':a.period==='week'?'Settimana corrente':'Mese corrente';
  function periodSelector(a){
    return '<section class="cx-card cx-period"><div><span class="cx-kicker">Obiettivi · '+h(a.start)+' / '+h(a.end)+'</span><h2>'+periodLabel(a)+'</h2><p class="cx-disclaimer">Consuntivo fino a oggi · previsto fino a oggi · obiettivo intero periodo</p></div><div class="cx-period-buttons" role="group" aria-label="Periodo">'+[['day','Giorno'],['week','Settimana'],['month','Mese']].map(([v,l])=>'<button type="button" data-cut-period="'+v+'" aria-pressed="'+(a.period===v)+'" class="cx-period-btn '+(a.period===v?'active':'')+'">'+l+'</button>').join('')+'</div></section>';
  }
  let levelCache=null,levelEngine=null,levelStatus='loading',levelError='',levelFlight=null,cardioEvidence={rows:[],available:false,sheetId:null,at:0};
  window.cut30SetCardioEvidence=(rows,at,sheetId)=>{if(sheetId!==state.prefs?.sheetId||!Array.isArray(rows))return;if(cardioEvidence.sheetId===sheetId&&cardioEvidence.at>at)return;cardioEvidence={rows,at,sheetId,available:true};levelCache=null;};
  const outcomes={improvement:'Miglioramento',maintenance:'Mantenimento',decline:'Calo ripetuto',baseline:'Costanza / riferimento',unknown:'Non valutabile'};
  function makeXp(){
    const calculate=levelEngine?.buildTrainingLevel||trackerEngine?.buildTrainingLevel;
    if(typeof calculate!=='function')return null;
    const today=localDate(),start=String(cfg('data_inizio')||'2026-11-02'),sheet=state.prefs?.sheetId,loads=loadEvidence.sheetId===sheet?loadEvidence:{rows:[],available:false},cardio=cardioEvidence.sheetId===sheet?cardioEvidence:{rows:[],available:false};
    const workouts=state.tables.Allenamenti||[];
    const key=JSON.stringify([today,start,sheet,workouts,loads.at||0,cardio.at||0,loads.available,cardio.available]);
    if(levelCache?.key===key)return levelCache.result;
    try{const result=calculate({today,start,workouts,loads:loads.rows,segments:cardio.rows,loadAvailable:loads.available,cardioAvailable:cardio.available});
    levelCache={key,result};levelStatus='ready';levelError='';return result;}catch(err){levelStatus='error';levelError=String(err?.message||err);console.error('CUT30 level calculation:',err);return null;}
  }
  window.cut30LevelForDate=date=>{const xp=makeXp();return xp?{event:xp.events.find(e=>e.date===date)||null,provisional:xp.provisional}:null;};
  async function loadLevelEngine(retry=false){
    if(levelFlight)return levelFlight;
    levelStatus='loading';levelError='';
    levelFlight=(async()=>{try{const mod=await import('./engine/training-level.mjs?v=3.6.1'+(retry?'&retry='+Date.now():''));
      if(typeof mod.buildTrainingLevel!=='function')throw Error('Modulo livello non aggiornato');
      levelEngine=mod;levelCache=null;levelStatus='ready';
    }catch(err){levelStatus='error';levelError=String(err?.message||err);console.error('CUT30 level module:',err);}
    finally{levelFlight=null;if(currentPage==='dashboard'||currentPage==='progress'||currentPage==='training')render();}})();
    return levelFlight;
  }
  function levelPlaceholder(){
    return '<section class="fit-level fit-level-pending" aria-label="Livello CUT30"><div class="fit-level-number"><small>LVL</small><strong>—</strong><span>/100</span></div><div class="fit-level-main"><div class="fit-level-title"><b>Livello CUT30</b></div><small role="status">'+(levelStatus==='error'?'Calcolo non disponibile: '+h(levelError):'Caricamento esperienza…')+'</small>'+(levelStatus==='error'?'<button type="button" class="btn btn-quiet btn-sm" data-level-retry>Riprova</button>':'')+'</div></section>';
  }
  function signedXp(n){return (n>0?'+':'')+n+' XP';}
  function icon(name){
    const shapes={
      shoe:'<path d="M4 15l4 1 3-6 3 3 6 2v4H4z"/><path d="M12 8l2 5"/>',
      fire:'<path d="M12 22c5 0 7-4 7-8 0-3-2-5-4-7 1 4-1 5-2 6-1-4-3-6-3-10C7 6 5 10 5 14c0 5 3 8 7 8z"/>',
      clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
      pulse:'<path d="M3 12h4l3-6 4 12 3-6h4"/>',
      calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
      barbell:'<path d="M3 9v6m3-8v10m3-5h6m3-5v10m3-8v6"/>',
      refresh:'<path d="M20 6v5h-5M4 18v-5h5"/><path d="M5.7 9A7 7 0 0 1 18 6l2 5M4 13a7 7 0 0 0 12.3 5l1.7-3"/>',
      target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
      trophy:'<path d="M6 3h12v7c0 4-2 6-6 6s-6-2-6-6zM8 21h8m-4-5v5M6 5H3v4c0 3 2 4 5 4m10-8h3v4c0 3-2 4-5 4"/>',
      chart:'<path d="M4 20V12m6 8V7m6 13V4m4 16H2"/>',
      info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
      check:'<path d="M4 12l5 5 11-11"/>'
    };
    return '<svg class="cx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(shapes[name]||shapes.chart)+'</svg>';
  }
  function track(val,max,theme="",small=false){
    const pc=bound((Number(val)||0)/(Number(max)||1)*100);
    return '<div class="cx-track'+(small?' cx-track-small':'')+'"><div class="cx-track-fill '+theme+'" style="width:'+pc.toFixed(1)+'%"></div></div>';
  }
  function axisChart(a){
    const cx=202,cy=160,r=110;
    const point=(index,pct)=>{const angle=-Math.PI/2+2*Math.PI*index/5;const length=r*(pct/100);return [(cx+length*Math.cos(angle)).toFixed(1),(cy+length*Math.sin(angle)).toFixed(1)].join(",");};
    const poly=scale=>AXES.map((_,i)=>point(i,scale)).join(" ");
    const valuePts=AXES.map((_,i)=>point(i,Object.values(a.metrics)[i].score===null?0:Object.values(a.metrics)[i].score)).join(" ");
    const grid=[20,40,60,80,100].map((v,i)=>'<polygon points="'+poly(v)+'" class="cx-grid-poly'+(i===4?' cx-outer':'')+'"/>').join("");
    const axes=AXES.map((axis,i)=>{const outer=point(i,100);const val=Object.values(a.metrics)[i].score;return '<line x1="'+cx+'" y1="'+cy+'" x2="'+outer.split(",")[0]+'" y2="'+outer.split(",")[1]+'" class="cx-grid-line"/>'+(val===null?'':'<circle cx="'+point(i,val).split(",")[0]+'" cy="'+point(i,val).split(",")[1]+'" r="4.5" class="cx-dot"/>');}).join("");
    const coords=[[202,20],[349,113],[301,310],[103,310],[55,113]];
    const labels=AXES.map((axis,i)=>'<text class="cx-radar-label" x="'+coords[i][0]+'" y="'+coords[i][1]+'" text-anchor="middle">'+axis.short+'</text>').join("");
    return '<svg class="cx-radar-svg" viewBox="0 0 404 340" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Radar del periodo: passi, esercizi, durata, cardio, costanza"><g>'+grid+axes+'<polygon points="'+valuePts+'" class="cx-radar-area"/>'+labels+'</g></svg>';
  }
  function radarCard(a){
    const m=Object.values(a.metrics);
    return '<section class="cx-card cx-radar-card"><div class="cx-head"><div><span class="cx-kicker">'+periodLabel(a)+'</span><h2>Aderenza al piano</h2></div><span class="cx-count">'+a.coverage+'/5 indicatori</span></div><div class="cx-radar-layout"><div class="cx-radar-wrap">'+axisChart(a)+'</div><div class="cx-axes">'+AXES.map((axis,i)=>'<div class="cx-axis"><div class="cx-axis-top"><span>'+axis.label+'</span><b>'+(m[i].score===null?'—':Math.round(m[i].score)+'/100')+'</b></div>'+track(m[i].score||0,100,'',true)+'<small>'+display(m[i].actual)+' / '+display(m[i].expected)+' previsti fino a oggi · totale '+display(m[i].full)+'</small></div>').join('')+'</div></div><p class="cx-disclaimer">Calorie attive escluse dal punteggio. Dati mancanti non valgono come zero; valori di durata stimati dallo storico quando disponibile. Non è una misura di forma fisica.</p></section>';
  }
  function dailyPlanCard(a){
    return '<section class="cx-card"><div class="cx-head"><div><span class="cx-kicker">Piano e consuntivo</span><h2>Dettaglio giorno per giorno</h2></div></div><p class="fit-table-hint">Scorri la tabella lateralmente per consultare tutti i valori.</p><div class="cx-period-table" role="region" aria-label="Dettaglio giornaliero, scorrimento orizzontale" tabindex="0"><table><thead><tr><th>Giorno / piano</th><th>Cardio eff./piano</th><th>Obiettivo cardio</th><th>Calorie registrate / stima</th><th>Tempo eff./prev.</th></tr></thead><tbody>'+a.daily.map(d=>'<tr><td>'+h(d.date)+'<small>'+h(d.program)+' · '+(d.source==='confermato'?'confermato':'riferimento attuale')+'</small></td><td>'+display(d.actual.cardio)+' / '+display(d.cardio)+' min</td><td>'+display(d.cardioGoal,' min')+'</td><td>'+display(d.actual.kcal)+' / '+display(d.calorieForecast)+' kcal</td><td>'+display(d.actual.minutes)+' / '+display(d.minutes)+' min</td></tr>').join('')+'</tbody></table></div><p class="cx-disclaimer">Stima calorie e minuti pesi: mediana di almeno due sedute precedenti dello stesso programma (massimo cinque). Non sono obiettivi calorici da raggiungere. Le quote cardio ripartiscono il target settimanale in proporzione al piano; non modificano le schede.</p></section>';
  }
  function recentNutrition(){
    const today=localDate();
    return [...state.tables.Nutrizione].filter(x=>x.qualita!=="eliminato"&&x.data===today);
  }
  function dailyMacros(){
    const day=localDate(),values=totals(day),goal=targetsFor(day);
    const elements=[["Calorie",values.kcal,goal.kcal,"kcal"],["Proteine",values.proteine,goal.proteine,"g"],["Carboidrati",values.carboidrati,goal.carboidrati,"g"],["Grassi",values.grassi,goal.grassi,"g"],["Fibre",values.fibre,25,"g"]];
    const meals=recentNutrition();
    return '<section class="cx-card cx-nutrition"><div class="cx-head"><div><span class="cx-kicker">Alimentazione</span><h2>Bilancio di oggi</h2></div><a href="#nutrition" data-nav="nutrition" class="cx-link">Apri diario</a></div><div class="cx-macro-hl"><div><span>Assunte</span><strong>'+tFmt(values.kcal)+'</strong><small>di '+tFmt(goal.kcal)+' kcal</small></div><div class="cx-macro-right">'+track(values.kcal,goal.kcal)+(meals.length?'<small>'+meals.length+' alimenti registrati</small>':'<small>Nessun pasto registrato oggi</small>')+'</div></div><div class="cx-macros">'+elements.slice(1).map(x=>'<div class="cx-macro-line"><div><span>'+x[0]+'</span><b>'+tFmt(x[1],1)+' <small>/ '+tFmt(x[2])+' '+x[3]+'</small></b></div>'+track(x[1],x[2],'',true)+'</div>').join('')+'</div><button class="cx-text-action" data-cut-refresh>'+icon("refresh")+' Aggiorna i pasti registrati in chat</button><p class="cx-disclaimer">Fibre: riferimento 25–35 g. I valori stimati dipendono dalle quantità comunicate.</p></section>';
  }
  function hero(a,xp){
    const day=localDate(),plan=programFor(day),done=isDone(day),score=a.index;
    return '<section class="cx-hero cx-training-hero"><div class="cx-hero-left"><span class="cx-kicker">CUT30 / TRAINING CLUB</span><p class="cx-hero-date">'+h(dayLabel(day,{weekday:"long",day:"numeric",month:"long"}))+'</p><h2>'+h(plan)+'</h2><div class="cx-session-tag '+(done?'is-complete':'')+'">'+(done?'SEDUTA COMPLETATA':'SESSIONE DEL GIORNO')+'</div><div class="cx-hero-buttons"><a class="cx-primary-action" href="#training" data-nav="training">'+icon("barbell")+' '+(done?'Apri sessione':'Apri allenamento')+'</a><button class="cx-ghost-action" data-cut-refresh aria-label="Aggiorna dati">'+icon("refresh")+'</button></div></div><div class="cx-hero-index"><span>ADERENZA</span><strong>'+(score===null?'—':score)+'<small>/100</small></strong><p>'+a.coverage+'/5 indicatori</p>'+track(score||0,100)+'</div></section>';
  }
  function xpBanner(){
    const xp=makeXp();if(!xp)return levelPlaceholder();
    const last=xp.events.at(-1),status=xp.provisional?'Storico parziale':last?outcomes[last.outcome]:'Nessuna seduta valutata';
    return '<a class="fit-level" href="#progress" data-nav="progress" aria-label="Apri progressione livello CUT30"><div class="fit-level-number"><small>LVL</small><strong>'+xp.level+'</strong><span>/100</span></div><div class="fit-level-main"><div class="fit-level-title"><b>Livello CUT30</b><span>'+tFmt(xp.total)+' XP</span></div>'+track(xp.level===100?1:xp.into,xp.step||1)+'<small>'+(xp.level===100?'Livello massimo':tFmt(xp.remaining)+' XP al prossimo livello')+' · '+status+'</small></div><span class="fit-chevron">›</span></a>';
  }
  function cards(a){
    const today=aggregates('day'),m=a.metrics;
    const records=[
      ["shoe","Passi registrati",display(m.steps.actual),display(m.steps.expected)+" previsti fino a oggi · "+a.stepDays+"/"+a.elapsedDays+" gg con dato"],
      ["fire","Calorie attive "+periodLabel(a).toLowerCase(),display(a.calories.actual," kcal"),(a.calories.partial?"Dati parziali · ":"")+"Totale registrato · stima periodo "+display(a.calories.forecast," kcal")],
      ["fire","Calorie attive oggi",display(today.calories.actual," kcal"),today.daily[0].hasWorkout?"Dati della seduta di oggi":"Nessun allenamento registrato oggi"],
      ["clock","Tempo attività",display(m.minutes.actual," min"),display(m.minutes.expected)+" previsti fino a oggi · "+display(m.minutes.full)+" totali"],
      ["barbell","Sedute completate",display(m.sessions.actual)+" / "+display(m.sessions.full),"Previste fino a oggi: "+display(m.sessions.expected)],
      ["pulse","Cardio",display(m.cardio.actual)+" / "+display(m.cardio.full)+" min","Piano "+display(a.cardioPlanned)+" min · obiettivo fino a oggi "+display(m.cardio.expected)+" min"]
    ];
    return '<section class="cx-stats">'+records.map(x=>'<div class="cx-stat"><div class="cx-stat-icon">'+icon(x[0])+'</div><span>'+x[1]+'</span><strong>'+x[2]+'</strong><small>'+x[3]+'</small></div>').join('')+'</section>';
  }
  function weekCard(a){
    const week=a,dates=a.daily;
    return '<section class="cx-card"><div class="cx-head"><div><span class="cx-kicker">Calendario</span><h2>Costanza · '+periodLabel(a)+'</h2></div><a href="#calendar" data-nav="calendar" class="cx-link">Calendario</a></div><div class="cx-week" style="grid-template-columns:repeat('+Math.min(dates.length,7)+',minmax(0,1fr))">'+dates.map(d=>'<div class="cx-weekday '+(d.actual.done?'completed':d.date===a.today?'today':d.date>a.today?'future':'')+'"><small>'+(a.period==='month'?String(parseDate(d.date).getDate()):dayLabel(d.date,{weekday:"short"}).slice(0,3))+'</small><span>'+(d.actual.done?icon("check"):parseDate(d.date).getDate())+'</span></div>').join('')+'</div><div class="cx-week-footer"><span>'+week.metrics.sessions.actual+' / '+week.metrics.sessions.full+' sedute</span><span>'+display(week.metrics.cardio.actual)+' / '+display(week.metrics.cardio.full)+' min cardio</span></div>'+track(week.metrics.cardio.actual,week.metrics.cardio.full)+'<p class="cx-disclaimer">Piano '+display(week.cardioPlanned,' min')+' · differenza rispetto all’obiettivo '+display(week.cardioGap,' min')+'.</p></section>';
  }
  function periodNutrition(a){
    const labels={kcal:'Calorie assunte',proteine:'Proteine',carboidrati:'Carboidrati',grassi:'Grassi',fibre:'Fibre'};
    return '<section class="cx-card"><div class="cx-head"><div><span class="cx-kicker">Alimentazione · '+periodLabel(a)+'</span><h2>Obiettivi nutrizionali</h2></div><a href="#nutrition" data-nav="nutrition" class="cx-link">Diario</a></div>'+Object.entries(a.nutrition).map(([k,m])=>'<div class="cx-macro-line"><div><span>'+labels[k]+'</span><b>'+display(m.actual)+' / '+display(m.expected)+' '+(k==='kcal'?'kcal':'g')+'</b></div>'+track(m.actual||0,m.expected||1,'',true)+'<small>Totale periodo: '+display(m.full)+'</small></div>').join('')+'<p class="cx-disclaimer">Registrazioni presenti in '+a.nutritionDays+'/'+a.elapsedDays+' giorni. Un giorno senza diario non dimostra assunzione nulla.</p></section>';
  }
  function muscleSummary(a){
    const muscle=a.muscles,evidence=a.muscleEvidence,source=loadEvidence.sheetId===state.prefs?.sheetId?loadEvidence:{status:'idle',error:''};
    const order=["Petto","Schiena","Spalle","Braccia","Quadricipiti","Posteriori","Polpacci","Core"];
    const total=order.reduce((sum,g)=>sum+muscle[g].working,0),planned=order.reduce((sum,g)=>sum+muscle[g].planned,0),legacy=order.reduce((sum,g)=>sum+muscle[g].unclassified,0);
    const metric=g=>{const v=muscle[g],status=v.displayStatus,pc=v.displayPercent===null?'N/D':v.displayPercent+'%';
      return '<div class="cx-muscle-item ms-'+status+'"><div class="ms-line"><strong>'+h(g)+'</strong><span class="ms-pct">'+pc+(v.partial&&v.displayPercent!==null?'*':'')+'</span></div>'+
       '<div class="ms-series"><b>'+(evidence.available?v.recorded:'—')+'</b> / '+v.planned+' serie registrate <small>· '+v.expected+' previste a oggi</small></div>'+
       '<div class="ms-track" aria-label="'+h(g)+' '+pc+'"><i style="width:'+Math.min(100,v.displayPercent??0)+'%"></i></div>'+
       (v.unclassified?'<small class="ms-note">'+v.unclassified+' non classificate · '+v.working+' allenanti verificate'+'</small>':'')+
       (v.checkedExercises?'<small class="ms-note">'+v.checkedExercises+' esercizi confermati da checklist (senza stima di serie).</small>':'')+
       (v.secondary?'<small class="ms-note">'+v.secondary+' coinvolgimenti indiretti</small>':'')+
       (v.missing?'<small class="ms-note">Dettaglio mancante per '+v.missing+' esercizi</small>':'')+
       (v.conflicts?'<small class="ms-note">'+v.conflicts+' serie in conflitto</small>':'')+'</div>';};
    return '<section class="cx-card cx-muscle-card" id="muscle-coverage"><div class="cx-head"><div><span class="cx-kicker">TRAIN / '+periodLabel(a)+'</span><h2>Copertura muscolare</h2></div><button type="button" class="cx-ghost-action ms-refresh" data-muscle-refresh aria-label="Aggiorna serie" '+(source.status==='loading'?'disabled':'')+'>'+icon("refresh")+'</button></div>'+
      '<div class="ms-overview"><div><strong>'+ (evidence.available?total+legacy:'—') +'</strong><span> serie registrate</span><small>'+ (evidence.available?total:'—') +' / '+planned+' allenanti · '+legacy+' non classificate</small></div><span class="ms-data">'+(source.status==='loading'?'Caricamento…':source.status==='error'?'Errore lettura':source.status==='disconnected'?'Google non collegato':evidence.available?'Storico '+(source.at?new Date(source.at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'caricato'):'In attesa')+'</span></div>'+
      '<div class="cx-muscle-mini">'+anatomySvg(muscle,true)+'</div><div class="ms-legend"><span class="ms-zero">Non registrato</span><span class="ms-partial">Parziale</span><span class="ms-goal">Obiettivo</span><span class="ms-over">Oltre</span><span class="ms-unknown">N/D</span></div>'+
      '<div class="cx-muscle-summary">'+order.map(metric).join('')+'</div>'+
      '<p class="cx-disclaimer">Totale registrato = allenanti + non classificate, escluso riscaldamento. Percentuale = serie registrate (allenanti + non classificate) / obiettivo dell’intero periodo. * = dettaglio parziale o serie non classificate. Il numero di allenanti verificate è distinto; riscaldamento e coinvolgimenti indiretti esclusi. Le spunte storiche non sono misure di volume.</p>'+
      (evidence.unmatched||evidence.invalid||evidence.conflicts?'<p class="ms-warning">Da riconciliare: '+evidence.unmatched+' record non associati, '+evidence.invalid+' non validi, '+evidence.conflicts+' conflitti. Nessuna serie inventata.</p>':'')+
      (source.status==='error'||source.status==='disconnected'?'<p class="ms-warning" role="status">'+h(source.error)+(evidence.available?' · Ultimo dato disponibile conservato.':'')+'</p>':'')+(!evidence.available&&source.status!=='loading'?'<button class="btn btn-quiet" type="button" data-muscle-refresh>'+(source.status==='disconnected'?'Collega Google':'Riprova caricamento')+'</button>':'')+'</section>';
  }
  function ringsCard(a){
    const rings=a.rings||[],colors=['#ff416d','#b8f34b','#40d8e8'];
    const selection=[['day','Giorno'],['week','Settimana'],['month','Mese']].map(([v,l])=>'<button type="button" data-cut-period="'+v+'" aria-pressed="'+(a.period===v)+'" class="fit-period '+(a.period===v?'active':'')+'">'+l+'</button>').join('');
    const art=rings.map((r,i)=>{const rad=63-i*17,c=2*Math.PI*rad,p=r.progress??0;return '<circle cx="78" cy="78" r="'+rad+'" fill="none" stroke="'+colors[i]+'" stroke-opacity=".16" stroke-width="12"/>'+
      (p>0?'<circle cx="78" cy="78" r="'+rad+'" fill="none" stroke="'+colors[i]+'" stroke-width="12" stroke-linecap="round" stroke-dasharray="'+(c*p/100)+' '+c+'" transform="rotate(-90 78 78)"/>':'');}).join('');
    const achieved=rings.filter(r=>!r.partial&&r.percent!==null&&r.percent>=100).length,eligible=rings.filter(r=>r.target>0).length;
    const labels=rings.map((r,i)=>'<div class="fit-ring-label"><span>'+h(r.label)+'</span><strong style="color:'+colors[i]+'">'+display(r.actual)+'<small> / '+(r.target===0?'—':display(r.target))+(r.unit?' '+r.unit:'')+'</small></strong><small class="fit-ring-note">'+(r.partial?'Dati parziali'+(r.percent===null?'':' · '+r.percent+'%'):r.target===0?'Non previsto':r.target===null?'Target non disponibile':r.percent===null?'Dato mancante':r.percent+'%')+'</small></div>').join('');
    return '<section class="fit-activity"><div class="fit-heading"><h2>Attività</h2><span>'+h(periodLabel(a))+'</span></div><div class="fit-periods" role="group" aria-label="Periodo">'+selection+'</div>'+
      '<div class="fit-rings-layout"><div class="fit-ring-art"><svg viewBox="0 0 156 156" role="img" aria-label="Anelli di avanzamento obiettivi">'+art+'<text x="78" y="76" text-anchor="middle" class="fit-ring-center">'+achieved+'/'+eligible+'</text><text x="78" y="89" text-anchor="middle" class="fit-ring-caption">obiettivi</text></svg></div><div class="fit-ring-labels">'+labels+'</div></div>'+
      '<p class="fit-caption">Registrato fino a oggi / obiettivo intero periodo. '+(rings[2]?.id==='cardio'?'Cardio mostrato perché mancano i passi. ':'')+'Le kcal attive sono stime, non un traguardo da inseguire.</p></section>';
  }
  function fitStats(a){
    const sets=Object.values(a.muscles).reduce((s,g)=>s+g.recorded,0);
    const items=[['fire','Calorie attive',display(a.calories.actual),'kcal',a.calories.partial?'Dati parziali':'Registrate'],['pulse','Cardio',display(a.metrics.cardio.actual),'min','Obiettivo '+display(a.metrics.cardio.full)+' min'],['barbell','Serie',a.muscleEvidence.available?display(sets):'—','','Registrate, escl. riscaldamento'],['calendar','Sedute',display(a.metrics.sessions.actual),' / '+display(a.metrics.sessions.full),'Completate']];
    return '<div class="fit-stats">'+items.map(([i,l,v,u,note])=>'<section class="fit-stat"><div class="fit-stat-label">'+icon(i)+'<span>'+l+'</span></div><strong>'+v+'<small>'+u+'</small></strong><span class="fit-caption">'+note+'</span></section>').join('')+'</div>';
  }
  function fitToday(){
    const day=localDate(),done=isDone(day),plan=programFor(day);
    return '<a class="fit-workout" href="#training" data-nav="training" data-fit-today><div class="fit-workout-icon">'+icon("barbell")+'</div><div><span class="fit-caption">'+h(dayLabel(day,{weekday:"long",day:"numeric",month:"long"}))+'</span><h2>'+h(plan)+'</h2><span class="fit-caption">'+(done?'Seduta completata':plan==='Recupero'?'Recupero programmato':'Allenamento di oggi')+'</span></div><span class="fit-chevron">›</span></a>';
  }
  function fullDashboard(){
    const a=aggregates();
    if(!a)return '<div class="cx-page fit-dashboard">'+xpBanner()+'<section class="cx-card">Caricamento obiettivi…</section></div>';
    return '<div class="cx-page cx-dashboard fit-dashboard">'+xpBanner()+ringsCard(a)+fitStats(a)+fitToday()+weekCard(a)+
      '<details class="fit-disclosure" open><summary>Copertura muscolare</summary>'+muscleSummary(a)+'</details>'+
      '<details class="fit-disclosure"><summary>Nutrizione</summary>'+periodNutrition(a)+'</details>'+
      '<details class="fit-disclosure fit-analytics"><summary>Analisi e previsioni</summary>'+radarCard(a)+dailyPlanCard(a)+'</details></div>';
  }
  function anatomySvg(groups,small=false){
    const val=g=>groups[g]?.displayPercent??null;
    const fills={unknown:"#555b57",none:"#555b57",zero:"#303632",partial:"#e9b84e",goal:"#bafa4d",over:"#f48a42"};
    const part=(group,d)=>{const v=groups[group]||{},status=v.displayStatus||'unknown';return '<path data-muscle="'+group+'" d="'+d+'" fill="'+(fills[status]||fills.unknown)+'" opacity="'+(status==='unknown'?'.72':'1')+'"><title>'+group+': '+(val(group)===null?'N/D':val(group)+'%')+'</title></path>';};
    const figure=(back=false)=>{
      const torso='<path class="cx-body-base" d="M75 76 C58 73 47 83 45 101 L48 142 59 171 61 195 86 216 111 195 114 171 125 142 128 101 C124 81 110 73 97 76 Z"/>';
      const head='<path class="cx-body-base" d="M67 29 Q86 7 105 29 L103 50 Q98 68 93 69 L93 81 79 81 79 69 Q69 64 68 51 Z"/>';
      const arms='<path class="cx-body-base" d="M48 99 Q36 98 31 120 L21 160 15 198 Q14 210 23 213 L31 195 43 161 50 121Z"/><path class="cx-body-base" d="M124 100 Q137 101 143 119 L153 161 160 198 Q158 211 150 212 L142 195 130 162 122 123Z"/>';
      const legs='<path class="cx-body-base" d="M62 193 L86 213 82 267 77 317 70 352 57 351 57 322 51 276 51 227Z"/><path class="cx-body-base" d="M110 193 L86 213 89 267 94 317 101 352 114 351 115 322 121 276 122 227Z"/>';
      const shoulders=part("Spalle","M49 86 Q42 96 37 113 L52 124 62 97 Z")+part("Spalle","M123 86 Q132 95 136 113 L120 124 110 97 Z");
      const armsDetail=part("Braccia","M35 120 L51 125 43 158 27 156 Z")+part("Braccia","M120 124 L137 120 144 156 128 158 Z")+part("Braccia","M24 162 L40 164 31 195 19 194 Z")+part("Braccia","M131 163 L149 162 154 194 141 195 Z");
      const legsFront=part("Quadricipiti","M62 215 L84 226 78 270 67 293 55 283 54 242 Z")+part("Quadricipiti","M109 215 L88 226 93 270 105 293 118 283 119 242 Z");
      const legsBack=part("Posteriori","M62 223 Q73 227 83 227 L78 278 66 292 54 280 Z")+part("Posteriori","M110 223 Q100 227 88 227 L94 278 106 292 119 280 Z");
      const calves=part("Polpacci","M57 293 Q68 307 79 292 L75 330 65 341 58 329 Z")+part("Polpacci","M93 292 Q104 307 116 293 L113 329 103 341 96 330 Z");
      const chest=part("Petto","M58 96 Q71 89 85 100 L84 126 Q70 132 54 124 Z")+part("Petto","M114 96 Q101 89 87 100 L88 126 Q102 132 118 124 Z");
      const abs=part("Core","M67 134 Q85 137 105 134 L103 173 87 193 70 173 Z");
      const backPath=part("Schiena","M58 95 Q83 111 86 99 Q90 111 114 95 L118 138 106 165 87 187 66 165 54 138 Z");
      const glutes=part("Posteriori","M62 181 L87 190 84 219 Q62 228 55 209 Z")+part("Posteriori","M111 181 L87 190 91 219 Q112 228 118 209 Z");
      return '<svg class="cx-anatomy" viewBox="0 0 174 372" role="img" aria-label="'+(back?'Vista posteriore':'Vista anteriore')+' dei gruppi muscolari"><defs><linearGradient id="cx-base-'+(back?'b':'f')+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#626963"/><stop offset=".5" stop-color="#363c37"/><stop offset="1" stop-color="#262c28"/></linearGradient><linearGradient id="cx-muscle-teal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#77ffe6"/><stop offset="1" stop-color="#10b5b5"/></linearGradient><linearGradient id="cx-muscle-idle"><stop stop-color="#456279"/><stop offset="1" stop-color="#294057"/></linearGradient></defs><g fill="url(#cx-base-'+(back?'b':'f')+')" stroke="#6e776f" stroke-width="1.1" stroke-linejoin="round">'+legs+torso+arms+head+'</g><g class="cx-anatomy-regions" stroke="#171c18" stroke-width="1.7">'+(back?backPath+glutes+shoulders+armsDetail+legsBack+calves:shoulders+chest+armsDetail+abs+legsFront+calves)+'</g><path d="M86 101V175" stroke="#b4bcb3" stroke-width=".8" opacity=".4" stroke-dasharray="4 4"/><text x="87" y="365" text-anchor="middle" font-size="12" font-weight="700" fill="#b4bcb3">'+(back?'RETRO':'FRONTE')+'</text></svg>';
    };
    return '<div class="cx-anatomy-pair '+(small?'small':'')+'">'+figure(false)+figure(true)+'</div>';
  }
  const nativeDashboard=renderDashboard;
  const nativeProgress=renderProgress;
  const nativeNutrition=renderNutrition;
  const originalRender=render;
  muscleSvg=anatomySvg;
  renderDashboard=fullDashboard;
  renderNutrition=function(){
    return '<div class="cx-section-lead"><div><span class="cx-kicker">Diario CUT30</span><h2>Pasti e obiettivi</h2><p>Registra i pasti, confronta i nutrienti e importa le registrazioni aggiunte da ChatGPT.</p></div><button data-cut-refresh class="cx-ghost-action">'+icon("refresh")+' Aggiorna dal cloud</button></div>'+nativeNutrition();
  };
  function xpCard(){
    const xp=makeXp();if(!xp)return '<section class="cx-card"><h2>Progressione personale</h2><p>Il dettaglio sarà disponibile al termine del caricamento del livello.</p></section>';
    const recent=xp.events.slice(-10).reverse();
    return '<section class="cx-card fit-level-detail"><div class="cx-head"><div><h2>Progressione personale</h2><span class="fit-caption">Livello '+xp.level+' / 100 · '+xp.total+' XP</span></div></div>'+
     (xp.provisional?'<p class="ms-warning">Dati parziali: il livello può variare quando si caricano Carichi e segmenti cardio.</p><button type="button" class="btn btn-quiet" data-cut-refresh>↻ Aggiorna storico</button>':'')+
     '<div class="fit-level-rules">'+[['improvement',35],['maintenance',10],['decline',-15],['baseline',5],['unknown',0]].map(([k,v])=>'<div><span>'+outcomes[k]+'</span><b class="xp-'+k+'">'+signedXp(v)+'</b></div>').join('')+'</div>'+
     '<h3>Ultime sedute</h3>'+(recent.length?recent.map(e=>'<details class="fit-xp-event"><summary><span><b>'+h(e.program)+'</b><small>'+h(e.date)+' · '+outcomes[e.outcome]+'</small></span><strong class="xp-'+e.outcome+'">'+signedXp(e.applied)+'</strong></summary><p>Livello dopo la seduta: '+e.level+'. '+(e.evidence.length?'Confronti omogenei:':'Nessun confronto omogeneo disponibile.')+'</p>'+e.evidence.map(v=>'<p>'+h(v.exercise)+' · '+h(v.domain)+' · '+h(v.trend==='up'?'Migliora':v.trend==='down'?'Calo ripetuto':v.trend==='flat'?'Stabile':'Incerto')+' · '+(v.change>0?'+':'')+v.change+'% ('+v.comparisons+' confronti)</p>').join('')+'</details>').join(''):'<p class="fit-caption">Nessuna seduta conclusa con dati utilizzabili.</p>')+
     '<details class="fit-level-method"><summary>Come viene calcolato</summary><p>La scala 1–100 misura la progressione nel programma CUT30, non la forma fisica assoluta. Il livello 1 è il punto di partenza, non una diagnosi; 100 non certifica lo status di atleta. Il costo del livello aumenta da 100 XP di 10 XP per livello. Lo storico viene ricalcolato senza bonus ripetuti.</p><p>Forza: stesso esercizio, attrezzo, palestra, unità, numero serie e sforzo comparabile (RIR/RPE); più carico senza meno ripetizioni, oppure più ripetizioni a pari carico. Cardio: tapis o piscina, stesso tipo e segmento, durata e frequenza media simili, pendenza comparabile sul tapis; confronto indicativo, non VO₂max. Miglioramento almeno 3% di carico/ritmo o una ripetizione in più; calo almeno 5% o due ripetizioni in meno a pari carico, per due confronti consecutivi. Esito della seduta per maggioranza dei confronti per esercizio. Dati mancanti o esiti discordanti non generano penalità. Recupero programmato, peso, BMI e kcal non assegnano XP.</p></details></section>';
  }
  renderProgress=function(){
    const a=aggregates(),base=nativeProgress();
    if(!a)return base;
    return '<div class="cx-section-lead"><div><span class="cx-kicker">PERFORMANCE / TRACK</span><h2>Progressi</h2><p>Volume registrato, peso corporeo e aderenza al piano.</p></div></div>'+periodSelector(a)+muscleSummary(a)+radarCard(a)+base+xpCard()+'<details class="cx-card cx-report-details"><summary>Dettaglio giorno per giorno</summary>'+dailyPlanCard(a)+'</details>';
  };
  render=function(){
    const ok=originalRender();if(ok===false)return false;
    const target=document.querySelector("#app");if(!target)return false;
    if(currentPage==="progress")target.insertAdjacentHTML("afterbegin",xpBanner());
    return true;
  };
  let lastRemoteCheck=0,refreshBusy=false;
  async function refreshCloud(silent=false){
    if(refreshBusy)return;
    if(!token||Date.now()>tokenExpires-30000){
      if(!silent){toast("Accesso Google non attivo: apri Impostazioni e collega il tuo account.");switchPage("settings");}
      return;
    }
    refreshBusy=true;
    try{
      const params=new URLSearchParams({valueRenderOption:"UNFORMATTED_VALUE"});
      for(const tab of Object.keys(TABLES))params.append("ranges","'"+tab+"'!A:"+String.fromCharCode(64+TABLES[tab].length));
      const result=await googleApi("/values:batchGet?"+params.toString());
      const merged={};
      const names=Object.keys(TABLES);
      if(result.valueRanges?.length!==names.length)throw new Error("Lettura cloud incompleta");
      for(let i=0;i<names.length;i++){
        const tab=names[i],rows=result.valueRanges?.[i]?.values||[],headers=TABLES[tab];
        if(rows.length&&rows[0].some((v,k)=>v!==headers[k]))throw new Error("Schema non valido in "+tab);
        const obj=rows.slice(1).filter(x=>x?.[0]!==""&&x?.[0]!=null).map(x=>sheetRow(tab,x));
        if(tab==="Config"){
          const map=new Map(obj.map(x=>[x.chiave,x]));
          for(const row of state.tables.Config)if(state.dirtyConfig.includes(row.chiave))map.set(row.chiave,row);
          merged[tab]=[...map.values()];
        }else{
          const combined=mergeRows(state.tables[tab],obj);
          merged[tab]=tab==="Allenamenti"?normalizeTrainingRows(combined):combined;
        }
      }
      state.tables=merged;state.lastSync=now();save();lastRemoteCheck=Date.now();render();
      if(!silent)toast("Dati aggiornati dal diario condiviso");
    }catch(err){
      console.error("CUT30 refresh from Google Sheets:",err);
      if(!silent)toast("Aggiornamento non riuscito: "+err.message);
    }finally{refreshBusy=false;}
  }
  function startup(){
    document.addEventListener("click",e=>{
      const levelRetry=e.target.closest('[data-level-retry]');if(levelRetry){e.preventDefault();levelCache=null;loadLevelEngine(true);render();return;}
      const muscleBtn=e.target.closest("[data-muscle-refresh]");if(muscleBtn){e.preventDefault();e.stopImmediatePropagation();loadMuscleHistory({interactive:true,force:true});return;}
      const todayLink=e.target.closest("[data-fit-today]");if(todayLink)selectedDate=localDate();
      const selector=e.target.closest("[data-cut-period]");
      if(selector){e.preventDefault();selectedPeriod=selector.dataset.cutPeriod;render();return;}
      const btn=e.target.closest("[data-cut-refresh]");
      if(!btn)return;
      e.preventDefault();e.stopImmediatePropagation();refreshCloud(false);loadMuscleHistory({interactive:false,force:true});window.cut30RefreshPerformance?.();
    },true);
    // La lettura periodica non riscrive il Google Sheet.
    window.setTimeout(()=>{refreshCloud(true);loadMuscleHistory({force:true});},650);
    window.setInterval(()=>{if(document.visibilityState==="visible"){if(Date.now()-lastRemoteCheck>300000)refreshCloud(true);loadMuscleHistory();}},60000);
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){if(Date.now()-lastRemoteCheck>120000)refreshCloud(true);loadMuscleHistory();}});
    loadLevelEngine();
    import("./engine/period-tracker.mjs?v=3.6.1").then(m=>{trackerEngine=m;render();}).catch(err=>{console.error("CUT30 period tracker:",err);});
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",startup,{once:true});else startup();
})();
