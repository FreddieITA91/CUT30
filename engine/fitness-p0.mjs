// P0 presentation calculations and deterministic accordion transitions.
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function activityRings(a){
 const m=a.metrics,days=a.daily.filter(d=>d.active);
 const minutesKnown=!days.some(d=>d.hasWorkout&&d.actual.minutes===null);
 const cardioKnown=!days.some(d=>d.hasWorkout&&d.actual.cardio===null);
 const make=(id,label,metric,unit,partial=false)=>({id,label,actual:finite(metric.actual)?metric.actual:null,target:finite(metric.full)?metric.full:null,unit,partial,
   progress:finite(metric.actual)&&finite(metric.full)&&metric.full>0?Math.min(100,Math.round(metric.actual/metric.full*100)):null,
   percent:finite(metric.actual)&&finite(metric.full)&&metric.full>0?Math.round(metric.actual/metric.full*100):null});
 const steps=a.stepDays>0;
 return [make('time','Tempo attivo',m.minutes,'min',!minutesKnown),make('sessions','Sedute',m.sessions,'',false),
   steps?make('steps','Passi',m.steps,'',a.stepDays<a.elapsedDays):make('cardio','Cardio',m.cardio,'min',!cardioKnown)];
}
export function initialOpen(){return null;}
export function nextOpen(items,current,completed){return current===completed?null:current;}
export function toggleOpen(current,id){return current===id?null:id;}
export function sessionMetrics(workout){
 const read=k=>{const v=workout?.[k];return v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<0?null:Number(v);};
 const parts=['durata_pesi_min','durata_cardio_min','durata_core_min'].map(read);
 return {minutes:parts.some(v=>v!==null)?parts.reduce((s,v)=>s+(v??0),0):null,partialMinutes:parts.some(v=>v===null),cardio:read('durata_cardio_min'),kcal:read('kcal_attive')};
}

/* Daily briefing: training intent, not a second exercise list. */
export function dayBriefing(program){
 const notes={
 'Upper A':'Parte superiore, enfasi sulla forza di spinta e tirata. Petto, dorsali e spalle lavorano con carichi controllati; le braccia completano il lavoro. Mantieni tecnica e margine nelle serie più impegnative.',
 'Upper B':'Parte superiore, enfasi su volume e qualità del movimento. Petto e dorsali sono il focus principale, con lavoro complementare su deltoidi posteriori, bicipiti e tricipiti. Mantieni tensione muscolare e controllo, senza inseguire il cedimento.',
 'Lower A':'Parte inferiore, enfasi sulla forza di quadricipiti e catena posteriore. Glutei, femorali, polpacci e core sostengono stabilità e controllo. Privilegia ampiezza sicura e recuperi adeguati.',
 'Lower B':'Parte inferiore, enfasi sul volume e sul controllo di quadricipiti, glutei e femorali. Completa il lavoro con polpacci e core; ricerca qualità delle ripetizioni più che incremento forzato del carico.',
 'Cardio H + core':'Condizionamento aerobico e stabilità del tronco. Gestisci lo sforzo secondo il riferimento individuale, senza inseguire la frequenza cardiaca. Il core lavora su controllo e resistenza.',
 'Cardio Z':'Resistenza aerobica a intensità moderata: ritmo sostenibile e costante, con attenzione al recupero. Non è una prova massimale.',
 'Recupero':'Recupero attivo facoltativo: movimento leggero e mobilità, senza obiettivi di carico o intensità. Priorità al riposo.'
 };
 return notes[program]||'Segui il programma della giornata con tecnica controllata e recupero adeguato.';
}
export const SESSION_FIELDS=['durata_pesi_min','durata_cardio_min','durata_core_min','distanza_cardio_km','passi_tapis','kcal_attive','fc_media','fc_max'];
export function validateSessionClosure(raw){
 const values=Object.fromEntries(SESSION_FIELDS.map(k=>{const v=raw[k];if(v==null||String(v).trim()==='')return [k,''];const n=Number(v);if(!Number.isFinite(n)||n<0)throw Error('Inserisci valori numerici non negativi.');return [k,n];}));
 if(!SESSION_FIELDS.slice(0,3).some(k=>values[k]!==''))throw Error('Indica almeno una durata effettiva (0 se non svolta).');
 if(values.fc_media!==''&&values.fc_max!==''&&values.fc_media>values.fc_max)throw Error('La FC media non può superare la FC massima.');
 return values;
}
// Session rating is descriptive: adherence and documented trend, not a physiological rating.
export function sessionRating({closed=false,done=0,planned=0,registered=0,plannedSets=0,cardio=null,cardioTarget=0,core=null,coreTarget=0,loadAvailable=false,event=null,provisional=false,recovery=false}={}){
 if(!closed)return null;
 if(recovery)return {rating:null,label:'Recupero',provisional:false,ratio:null};
 const parts=[],missing=[];
 if(plannedSets>0&&loadAvailable)parts.push(Math.min(1,Math.max(0,registered/plannedSets)));
 else if(plannedSets>0)missing.push('serie non verificabili');
 if(planned>0)parts.push(Math.min(1,Math.max(0,done/planned)));
 for(const [value,target,label] of [[cardio,cardioTarget,'cardio'],[core,coreTarget,'core']])if(target>0){if(value==null||value==='')missing.push(label+' non registrato');else parts.push(Math.min(1,Math.max(0,Number(value)/target)));}
 if(!parts.length)return {rating:null,label:'Non valutabile',provisional:true,ratio:null};
 const ratio=parts.reduce((s,v)=>s+v,0)/parts.length,partial=provisional||missing.length>0||!event;
 const rating=ratio<.25?1:ratio<.6?2:ratio<.85?3:ratio>=.99&&event?.outcome==='improvement'&&!partial?5:4;
 return {rating,label:['','Aderenza molto bassa','Aderenza parziale','Seduta discreta','Buona aderenza','Obiettivi raggiunti e progresso documentato'][rating],provisional:partial,ratio,missing};
}
