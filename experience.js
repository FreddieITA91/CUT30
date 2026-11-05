(function cut30Experience(){
  "use strict";
  const AXES=[{id:"steps",label:"Passi",short:"Passi"},{id:"calories",label:"Calorie attive",short:"Calorie"},{id:"duration",label:"Tempo attività",short:"Tempo"},{id:"cardio",label:"Cardio",short:"Cardio"},{id:"consistency",label:"Costanza",short:"Costanza"}];
  const bound=(v,lo=0,hi=100)=>Math.min(hi,Math.max(lo,Number(v)||0));
  const tFmt=(v,d=0)=>Number(v||0).toLocaleString("it-IT",{maximumFractionDigits:d,minimumFractionDigits:d});
  const dayData=(key,day)=>state.tables[key].filter(x=>x.data===day);
  const isTraining=x=>x&&x.stato==="completato";
  const uniqueCompleted=()=>{const m=new Map();for(const x of state.tables.Allenamenti.filter(isTraining))m.set(x.data,x);return[...m.values()]};
  const lastDays=(count=7)=>Array.from({length:count},(_,i)=>shiftDate(localDate(),i-count+1));
  const mSteps=()=>{const map=new Map();for(const x of state.tables.Misure||[])if(n(x.passi_giornalieri)>0)map.set(x.data,Math.max(n(x.passi_giornalieri),n(map.get(x.data))));return map};
  function aggregates(){
    const today=localDate(),week=weekStart(today),days=mondayDates(today);
    const done=uniqueCompleted(),weekDone=done.filter(x=>days.includes(x.data));
    const wMinutes=weekDone.reduce((a,x)=>a+n(x.durata_pesi_min)+n(x.durata_cardio_min)+n(x.durata_core_min),0);
    const cardio=weekDone.reduce((a,x)=>a+n(x.durata_cardio_min),0);
    const weekDaily=days.filter(d=>d<=today),steps=mSteps(),recent=lastDays();
    const recentSteps=recent.filter(d=>steps.has(d)),avgSteps=recentSteps.length?Math.round(recentSteps.reduce((s,d)=>s+steps.get(d),0)/recentSteps.length):null;
    const kcalEntries=weekDone.filter(x=>n(x.kcal_attive)>0),avgActive=kcalEntries.length?Math.round(kcalEntries.reduce((s,x)=>s+n(x.kcal_attive),0)/kcalEntries.length):null;
    const targetSteps=n(cfg("passi_giorno"))||12000,cardioGoal=n(cfg("obiettivo_cardio_sett"))||300;
    const values=[
      avgSteps===null?null:bound(100*avgSteps/targetSteps),
      avgActive===null?null:bound(100*avgActive/500),
      bound(100*wMinutes/420),
      bound(100*cardio/cardioGoal),
      bound(100*weekDone.length/6)
    ];
    const comparable=values.filter(v=>v!==null);
    const index=comparable.length?Math.round(comparable.reduce((a,x)=>a+x,0)/comparable.length):null;
    return {today,week,weekDone,done,wMinutes,cardio,cardioGoal,avgSteps,avgActive,stepDays:recentSteps.length,activeDays:kcalEntries.length,values,index,coverage:comparable.length,days,weekDaily};
  }
  function makeXp(){
    const workouts=uniqueCompleted(),steps=mSteps(),start=String(cfg("data_inizio")||"2026-11-02"),nowDay=localDate();
    let total=0,why={training:0,exercises:0,cardio:0,steps:0,nutrition:0,week:0,month:0}, completed=new Set(workouts.map(x=>x.data));
    for(const x of workouts){if(x.data<start||x.data>nowDay)continue;total+=70;why.training+=70;if(n(x.durata_cardio_min)>=30){total+=15;why.cardio+=15;}}
    const exercisesByDate=new Map();
    for(const e of state.tables.Esercizi||[]){
      if(String(e.completato)!=="true"||!e.data||e.data<start||e.data>nowDay)continue;
      if(!exercisesByDate.has(e.data))exercisesByDate.set(e.data,new Set());
      exercisesByDate.get(e.data).add(e.esercizio);
    }
    for(const ids of exercisesByDate.values()){
      const points=Math.min(30,ids.size*3);
      total+=points;why.exercises+=points;
    }
    for(const [date,value] of steps){if(date>=start&&date<=nowDay&&value>=(n(cfg("passi_giorno"))||12000)){total+=20;why.steps+=20;}}
    const nutritionDates=new Set((state.tables.Nutrizione||[]).filter(x=>x.data>=start&&x.data<=nowDay&&x.qualita!=="eliminato").map(x=>x.data));
    for(const date of nutritionDates){const eaten=totals(date),goal=targetsFor(date);if(eaten.kcal>=goal.kcal*.6&&eaten.proteine>=goal.proteine*.8){total+=15;why.nutrition+=15;}if(eaten.kcal>=goal.kcal*.6&&eaten.fibre>=25){total+=10;why.nutrition+=10;}if(eaten.kcal>=goal.kcal*.85&&eaten.kcal<=goal.kcal*1.15&&eaten.proteine>=goal.proteine*.8){total+=15;why.nutrition+=15;}}
    let cursor=weekStart(start),guard=0;
    while(cursor<=nowDay&&guard++<60){const dates=mondayDates(cursor),cnt=dates.filter(d=>completed.has(d)).length;const mins=workouts.filter(x=>dates.includes(x.data)).reduce((s,x)=>s+n(x.durata_cardio_min),0);if(cnt>=6){total+=60;why.week+=60;}if(mins>=(n(cfg("obiettivo_cardio_sett"))||300)){total+=40;why.week+=40;}cursor=shiftDate(cursor,7);}
    const months=new Map();
    for(const x of workouts){const key=x.data.slice(0,7);months.set(key,(months.get(key)||0)+1);}
    for(const c of months.values())if(c>=18){total+=80;why.month+=80;}
    const step=250,level=Math.min(100,1+Math.floor(total/step)),into=total%step,remaining=step-into;
    return {total,level,into,step,remaining,why};
  }
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
    const valuePts=AXES.map((_,i)=>point(i,a.values[i]===null?0:a.values[i])).join(" ");
    const grid=[20,40,60,80,100].map((v,i)=>'<polygon points="'+poly(v)+'" class="cx-grid-poly'+(i===4?' cx-outer':'')+'"/>').join("");
    const axes=AXES.map((axis,i)=>{const outer=point(i,100);const val=a.values[i];return '<line x1="'+cx+'" y1="'+cy+'" x2="'+outer.split(",")[0]+'" y2="'+outer.split(",")[1]+'" class="cx-grid-line"/>'+(val===null?'':'<circle cx="'+point(i,val).split(",")[0]+'" cy="'+point(i,val).split(",")[1]+'" r="4.5" class="cx-dot"/>');}).join("");
    const coords=[[202,20],[349,113],[301,310],[103,310],[55,113]];
    const labels=AXES.map((axis,i)=>'<text class="cx-radar-label" x="'+coords[i][0]+'" y="'+coords[i][1]+'" text-anchor="middle">'+axis.short+'</text>').join("");
    return '<svg class="cx-radar-svg" viewBox="0 0 404 340" role="img" aria-label="Radar di attività delle ultime settimane: passi, calorie attive, durata, cardio, costanza"><g>'+grid+axes+'<polygon points="'+valuePts+'" class="cx-radar-area"/>'+labels+'</g></svg>';
  }
  function radarCard(a){
    const descriptions=[
      a.avgSteps===null?'Non registrati':tFmt(a.avgSteps)+' media ('+a.stepDays+' gg)',
      a.avgActive===null?'Non registrate':tFmt(a.avgActive)+' kcal ('+a.activeDays+' sed.)',
      tFmt(a.wMinutes)+' min / 420',
      tFmt(a.cardio)+' / '+tFmt(a.cardioGoal)+' min',
      a.weekDone.length+' / 6 sedute'
    ];
    return '<section class="cx-card cx-radar-card"><div class="cx-head"><div><span class="cx-kicker">Ultimi 7 giorni</span><h2>Radar performance</h2></div><span class="cx-count">'+a.coverage+'/5 indicatori</span></div><div class="cx-radar-layout"><div class="cx-radar-wrap">'+axisChart(a)+'</div><div class="cx-axes">'+AXES.map((axis,i)=>'<div class="cx-axis"><div class="cx-axis-top"><span>'+axis.label+'</span><b>'+(a.values[i]===null?'—':Math.round(a.values[i])+'/100')+'</b></div>'+track(a.values[i]||0,100,'',true)+'<small>'+descriptions[i]+'</small></div>').join('')+'</div></div><p class="cx-disclaimer">Punteggi normalizzati su obiettivi di attività, non una misurazione clinica della forma fisica. I dati non registrati restano «—».</p></section>';
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
    const day=localDate(),plan=programFor(day),done=isDone(day),status=token&&tokenExpires>Date.now()+30000,score=a.index;
    return '<section class="cx-hero"><div class="cx-hero-left"><span class="cx-kicker">Il tuo spazio di allenamento</span><h2>'+h(dayLabel(day,{weekday:"long",day:"numeric",month:"long"}))+'</h2><p>Oggi: <strong>'+h(plan)+'</strong> · '+(done?'Sessione completata':'Sessione da svolgere')+'</p><div class="cx-hero-buttons"><a class="cx-primary-action" href="#training" data-nav="training">'+icon("barbell")+' Apri allenamento</a><button class="cx-ghost-action" data-cut-refresh>'+icon("refresh")+' Aggiorna dati</button></div></div><div class="cx-score-circle"><strong>'+(score===null?'—':score)+'</strong><small>indice attività<br/>/100</small><span>'+(a.coverage<5?'Provvisorio':'Calcolato')+'</span></div></section>';
  }
  function xpBanner(){
    const a=aggregates(),xp=makeXp(),ready=token&&tokenExpires>Date.now()+30000;
    return '<section class="cx-xp-banner" aria-label="Livello CUT30 ed esperienza accumulata"><div class="cx-xp-emblem">'+icon("trophy")+'<b>'+xp.level+'</b></div><div class="cx-xp-name"><strong>Livello CUT30 '+xp.level+'</strong><span>'+tFmt(xp.total)+' XP accumulati · '+tFmt(xp.remaining)+' XP al prossimo livello</span></div><div class="cx-xp-bar">'+track(xp.into,xp.step)+'</div><div class="cx-sync-state '+(ready?'cx-online':'')+'"><span class="cx-sync-dot"></span>'+(ready?'Google collegato':'Archivio locale')+'</div></section>';
  }
  function cards(a){
    const steps=a.avgSteps===null?'—':tFmt(a.avgSteps),wk=a.weekDone.length;
    const records=[
      ["shoe","Passi medi",steps,a.avgSteps===null?"Passi totali non registrati":"Ultimi "+a.stepDays+" giorni con dato"],
      ["fire","Calorie attive",a.avgActive===null?"—":tFmt(a.avgActive)+" kcal",a.avgActive===null?"Dati non registrati":"Media su "+a.activeDays+" sedute"],
      ["clock","Tempo settimanale",tFmt(a.wMinutes)+" min","Sala pesi + cardio + core"],
      ["barbell","Sedute completate",wk+" / 6","Questa settimana"],
      ["pulse","Cardio",tFmt(a.cardio)+" / "+tFmt(a.cardioGoal)+" min","Obiettivo settimanale"]
    ];
    return '<section class="cx-stats">'+records.map(x=>'<div class="cx-stat"><div class="cx-stat-icon">'+icon(x[0])+'</div><span>'+x[1]+'</span><strong>'+x[2]+'</strong><small>'+x[3]+'</small></div>').join('')+'</section>';
  }
  function weekCard(a){
    const today=localDate(),dates=mondayDates(today);
    return '<section class="cx-card"><div class="cx-head"><div><span class="cx-kicker">Calendario</span><h2>Costanza settimanale</h2></div><a href="#calendar" data-nav="calendar" class="cx-link">Calendario</a></div><div class="cx-week">'+dates.map(d=>'<div class="cx-weekday '+(isDone(d)?'completed':d===today?'today':d>today?'future':'')+'"><small>'+dayLabel(d,{weekday:"short"}).slice(0,3)+'</small><span>'+(isDone(d)?icon("check"):parseDate(d).getDate())+'</span></div>').join('')+'</div><div class="cx-week-footer"><span>'+a.weekDone.length+' giorni completati su 6</span><span>'+tFmt(a.cardio)+' / '+tFmt(a.cardioGoal)+' min cardio</span></div>'+track(a.cardio,a.cardioGoal)+'</section>';
  }
  function muscleSummary(){
    const muscle=progressByMuscle(localDate());
    const order=["Petto","Schiena","Spalle","Braccia","Quadricipiti","Posteriori","Polpacci","Core"];
    return '<section class="cx-card"><div class="cx-head"><div><span class="cx-kicker">Volume programmato · CUT30</span><h2>Gruppi muscolari</h2></div><a href="#progress" data-nav="progress" class="cx-link">Dettaglio</a></div><div class="cx-muscle-mini">'+anatomySvg(muscle,true)+'</div><div class="cx-muscle-summary">'+order.slice(0,6).map(g=>{const v=muscle[g],pct=v.planned?bound(100*v.done/v.planned):0;return '<div><span>'+g+'</span><strong>'+Math.round(pct)+'%</strong>'+track(pct,100,'',true)+'</div>'}).join('')+'</div><p class="cx-disclaimer">Percentuali = volume completato / volume programmato, non crescita muscolare.</p></section>';
  }
  function fullDashboard(){
    const a=aggregates(),xp=makeXp();
    return '<div class="cx-page">'+hero(a,xp)+cards(a)+'<div class="cx-main-grid">'+radarCard(a)+dailyMacros()+'</div><div class="cx-main-grid">'+weekCard(a)+muscleSummary()+'</div><section class="cx-card cx-footnote"><div><b>Indice attività '+(a.index===null?'—':a.index+'/100')+'</b><p>Valutazione indicativa costruita sui dati inseriti. Non misura VO₂max, forza massima o composizione corporea: per questi servono rilevazioni dedicate.</p></div><a href="#progress" data-nav="progress" class="cx-link">Scopri come funziona</a></section></div>';
  }
  function anatomySvg(groups,small=false){
    const val=g=>{const v=groups[g];return v&&v.planned?bound(v.done/v.planned):0};
    const part=(group,d)=>'<path data-muscle="'+group+'" d="'+d+'" style="--muscle-strength:'+val(group).toFixed(3)+'" fill="'+(val(group)>0?"url(#cx-muscle-teal)":"url(#cx-muscle-idle)")+'" opacity="'+(val(group)>0?(0.38+val(group)*.6).toFixed(2):".55")+'"><title>'+group+': '+Math.round(val(group)*100)+'%</title></path>';
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
      return '<svg class="cx-anatomy" viewBox="0 0 174 372" role="img" aria-label="'+(back?'Vista posteriore':'Vista anteriore')+' dei gruppi muscolari"><defs><linearGradient id="cx-base-'+(back?'b':'f')+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#526b83"/><stop offset=".5" stop-color="#22354b"/><stop offset="1" stop-color="#182537"/></linearGradient><linearGradient id="cx-muscle-teal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#77ffe6"/><stop offset="1" stop-color="#10b5b5"/></linearGradient><linearGradient id="cx-muscle-idle"><stop stop-color="#456279"/><stop offset="1" stop-color="#294057"/></linearGradient></defs><g fill="url(#cx-base-'+(back?'b':'f')+')" stroke="#6a8ba3" stroke-width="1.1" stroke-linejoin="round">'+legs+torso+arms+head+'</g><g class="cx-anatomy-regions" stroke="#18334b" stroke-width="1.7">'+(back?backPath+glutes+shoulders+armsDetail+legsBack+calves:shoulders+chest+armsDetail+abs+legsFront+calves)+'</g><path d="M86 101V175" stroke="#9bc5d6" stroke-width=".8" opacity=".4" stroke-dasharray="4 4"/><text x="87" y="365" text-anchor="middle" font-size="12" font-weight="700" fill="#a5bbcf">'+(back?'RETRO':'FRONTE')+'</text></svg>';
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
    const xp=makeXp();
    const entries=[
      ["Allenamenti",xp.why.training],["Esercizi spuntati",xp.why.exercises],
      ["Cardio",xp.why.cardio],["Obiettivi passi",xp.why.steps],
      ["Alimentazione",xp.why.nutrition],["Bonus settimanali",xp.why.week],
      ["Bonus mensili",xp.why.month]
    ];
    return '<section class="cx-card cx-xp-detail"><div class="cx-head"><div><span class="cx-kicker">Progressione personale</span><h2>Come guadagni XP</h2></div><span class="cx-count">Livello '+xp.level+'</span></div><div class="cx-xp-breakdown">'+entries.map(x=>'<div><span>'+x[0]+'</span><strong>'+tFmt(x[1])+' XP</strong></div>').join('')+'</div><p class="cx-disclaimer">70 XP per sessione completata, fino a 30 XP per spunte di esercizi, 15 XP per cardio di almeno 30 minuti, bonus per passi e obiettivi nutrizionali raggiunti senza deficit eccessivi. Ulteriori bonus a settimana e mese completati. Punti ricalcolati dalle registrazioni uniche, senza duplicazioni.</p></section>';
  }
  renderProgress=function(){
    const a=aggregates(),base=nativeProgress();
    const legend=base.replace(/<span class="tiny" style="min-width:45px;text-align:right">(\d+)\/(\d+)<\/span>/g,function(_,done,planned){return '<span class="tiny cx-percent" style="min-width:45px;text-align:right">'+(Number(planned)?Math.round(100*Number(done)/Number(planned)):0)+'%</span>';});
    return '<div class="cx-section-lead"><div><span class="cx-kicker">Analisi dell’attività</span><h2>Progressi misurabili</h2><p>Radar attività, peso corporeo e distribuzione del volume di lavoro muscolare.</p></div></div>'+radarCard(a)+xpCard()+legend;
  };
  render=function(){
    const ok=originalRender();if(ok===false)return false;
    const target=document.querySelector("#app");if(!target)return false;
    target.insertAdjacentHTML("afterbegin",xpBanner());
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
      for(const tab of Object.keys(TABLES))params.append("ranges","'"+tab+"'!A1:O2000");
      const result=await googleApi("/values:batchGet?"+params.toString());
      const merged={};
      const names=Object.keys(TABLES);
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
      const btn=e.target.closest("[data-cut-refresh]");
      if(!btn)return;
      e.preventDefault();e.stopImmediatePropagation();refreshCloud(false);
    },true);
    // La lettura periodica non riscrive il Google Sheet.
    window.setTimeout(()=>refreshCloud(true),650);
    window.setInterval(()=>{if(document.visibilityState==="visible"&&Date.now()-lastRemoteCheck>300000)refreshCloud(true);},120000);
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&Date.now()-lastRemoteCheck>120000)refreshCloud(true);});
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",startup,{once:true});else startup();
})();
