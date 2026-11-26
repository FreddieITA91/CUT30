// CUT30 training log: public-domain exercise imagery, no personal data.
const source='https://raw.githubusercontent.com/yuhonas/free-exercise-db/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/';
const guides={
 bench:['Barbell_Bench_Press_-_Medium_Grip','Petto e tricipiti','Piedi stabili, scapole raccolte e polsi sopra i gomiti. Abbassa verso il petto con controllo, poi spingi senza rimbalzare.','Tensione sul petto; gomiti e polsi stabili. Evita dolore alla spalla e arco eccessivo.'],
 row:['Dumbbell_Incline_Row','Dorsali e centro schiena','Appoggia il torace alla panca; tira i gomiti indietro, pausa breve e ritorno controllato.','Senti la schiena contrarsi, non il collo; evita slanci.'],
 incline:['Incline_Dumbbell_Press','Petto superiore','Panca inclinata moderatamente, piedi a terra. Abbassa i manubri ai lati del petto e spingi mantenendo i polsi neutri.','Tensione nella parte alta del petto, non dolore alla spalla.'],
 pulldown:['Wide-Grip_Lat_Pulldown','Dorsali','Blocca le cosce; porta i gomiti verso i fianchi e la barra davanti al petto. Ritorna lentamente.','Senti i dorsali allungarsi e contrarsi; evita tirate dietro la nuca e oscillazioni.'],
 shoulder:['Dumbbell_Shoulder_Press','Deltoidi e tricipiti','Addome attivo, schiena neutra; spingi sopra la testa senza inarcare la zona lombare.','Spalle attive; evita dolore, compensi lombari e spinta delle gambe.'],
 lateral:['Side_Lateral_Raise','Deltoide laterale','Gomiti leggermente flessi, solleva le braccia lateralmente fino a un’altezza confortevole, poi scendi lentamente.','Tensione laterale della spalla; non sollevare le spalle verso le orecchie.'],
 curl:['Dumbbell_Bicep_Curl','Bicipiti','Tieni i gomiti vicino ai fianchi; fletti senza oscillare il busto e distendi con controllo.','Tensione sul bicipite, non sulla zona lombare.'],
 pushdown:['Triceps_Pushdown','Tricipiti','Gomiti fermi ai fianchi, estendi gli avambracci verso il basso; risali senza spostare le spalle.','Contrazione dietro il braccio; niente slancio del tronco.'],
 squat:['Barbell_Squat','Quadricipiti e glutei','Piedi stabili, ginocchia in linea con le punte. Scendi entro la mobilità controllabile e risali mantenendo il busto stabile.','Pressione distribuita sul piede, lavoro di gambe e glutei; niente dolore articolare.'],
 rdl:['Romanian_Deadlift','Femorali e glutei','Ginocchia morbide, spingi il bacino indietro con il carico vicino alle gambe. Fermati prima di perdere la posizione neutra.','Allungamento dei femorali, glutei attivi; non forzare la zona lombare.'],
 split:['Split_Squat_with_Dumbbells','Quadricipiti e glutei','Per la variante bulgara appoggia il piede posteriore su una panca stabile. Scendi sul piede anteriore, mantenendo il ginocchio in linea.','Carico principalmente sulla gamba anteriore; equilibrio e controllo prima del peso.'],
 curlleg:['Lying_Leg_Curls','Femorali','Allinea il ginocchio al perno della macchina; fletti senza sollevare il bacino e torna lentamente.','Contrazione dietro la coscia; evita compensi della schiena.'],
 calf:['Standing_Calf_Raises','Polpacci','Spingi sull’avampiede, solleva i talloni, pausa e abbassa in modo controllato.','Contrazione e allungamento del polpaccio, senza rimbalzi.'],
 crunch:['Cable_Crunch','Addominali','In ginocchio, fletti il tronco avvicinando le costole al bacino; non tirare il cavo con le braccia.','Addome contratto; evita di trasformarlo in un movimento del bacino.'],
 plank:['Plank','Core','Gomiti sotto le spalle, bacino neutro, glutei e addome attivi. Respira durante la tenuta.','Tronco stabile; interrompi se perdi posizione o senti dolore lombare.'],
 deadbug:['Dead_Bug','Core','Supino, anche e ginocchia flesse; estendi lentamente braccio e gamba opposti senza inarcare la schiena.','Addome attivo e bacino immobile; riduci l’ampiezza se perdi controllo.'],
 pallof:['Pallof_Press','Core antirotazione','Posizionati di lato al cavo, mani al petto. Estendi le braccia resistendo alla rotazione del busto.','Tensione addominale laterale, bacino e spalle immobili.'],
 'ub-pullup':['Band_Assisted_Pull-Up','Dorsali e bicipiti','Usa l’assistenza necessaria, tira i gomiti verso il basso e risali senza slancio. Discesa controllata.','Dorsali attivi; non compensare col collo. La foto mostra una variante assistita con elastico.'],
 'ub-dbpress':['Dumbbell_Bench_Press','Petto e tricipiti','Piedi saldi, scapole stabili; abbassa i manubri in controllo e spingi verso l’alto.','Tensione del petto; non lasciare cadere i gomiti oltre una posizione confortevole.'],
 'ub-cablerow':['Seated_Cable_Rows','Dorsali e centro schiena','Busto stabile e schiena neutra; tira la maniglia verso l’addome, pausa e rilascio controllato.','Contrazione della schiena; evita di dondolare.'],
 'ub-chest':['Cable_Crossover','Petto','Gomiti leggermente piegati, avvicina le mani davanti al torace in un arco controllato.','Petto in tensione, senza dolore anteriore della spalla.'],
 'ub-rear':['Reverse_Flyes','Deltoidi posteriori','Busto stabile, apri le braccia lateralmente con gomiti morbidi; ritorno lento.','Parte posteriore delle spalle attiva; evita di alzare le spalle.'],
 'lb-press':['Leg_Press','Quadricipiti e glutei','Appoggia tutta la pianta del piede; abbassa finché il bacino resta aderente, spingi senza bloccare bruscamente le ginocchia.','Lavoro delle cosce, bacino stabile; nessun dolore a ginocchia o schiena.'],
 'lb-hip':['Barbell_Hip_Thrust','Glutei','Scapole appoggiate, mento leggermente raccolto; estendi le anche con costole basse e pausa in alto.','Contrazione dei glutei, non iperestensione lombare.'],
 'lb-extension':['Leg_Extensions','Quadricipiti','Allinea le ginocchia al perno; estendi lentamente e controlla la discesa senza slanci.','Tensione sulla parte anteriore della coscia, movimento senza dolore.'],
 'lb-curl':['Seated_Leg_Curl','Femorali','Regola il sedile e blocca le cosce; fletti le ginocchia e ritorna in controllo.','Contrazione dietro la coscia senza sollevare il bacino.'],
 'lb-core':['Hanging_Leg_Raise','Addominali e flessori anca','Dalla sospensione stabile porta le ginocchia verso il tronco, limitando l’oscillazione. La foto mostra la variante a gambe distese.','Addome attivo, bacino controllato; non usare lo slancio.'],
 'cz-cardio':['Walking_Treadmill','Resistenza aerobica','Procedi a intensità moderata e sostenibile; regola ritmo e pendenza in funzione del piano e della percezione dello sforzo.','Respiro più rapido ma conversazione ancora possibile; riduci se compaiono sintomi.'],
 walk:['Walking_Treadmill','Recupero attivo','Cammina a ritmo facile o esegui mobilità confortevole. Non inseguire un obiettivo intenso.','Respiro tranquillo, sensazione di recupero.']
};
guides['ub-lateral']=guides.lateral;guides['ub-bicep']=guides.curl;guides['ub-tricep']=guides.pushdown;guides['lb-calf']=guides.calf;
const alternatives={
 'Chest press':['Cable_Chest_Press','Petto e tricipiti','Regola l’altezza delle impugnature, appoggia il busto se previsto dalla macchina; spingi e ritorna con controllo.','Tensione sul petto, spalle stabili; la foto mostra una variante ai cavi.'],
 'Leg press':guides['lb-press'],'Lat machine':guides.pulldown
};
export const namesFor=e=>String(e.name).split('/').map(x=>x.trim()).filter(Boolean);
export const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function guideFor(e,variant){const g=(variant&&alternatives[variant])||guides[e.id];if(!g)return null;return {frames:[source+g[0]+'/0.jpg',source+g[0]+'/1.jpg'],muscle:g[1],technique:g[2],feel:g[3]};}
export function matching(e,rows){const keys=namesFor(e).map(norm);return rows.filter(r=>keys.includes(norm(r.esercizio)));}
export function latestSession(e,rows,date){const all=matching(e,rows).filter(x=>String(x.data)<date&&x.data);const last=all.map(x=>x.data).sort().at(-1);return all.filter(x=>x.data===last).sort((a,b)=>Number(a.numero_serie)-Number(b.numero_serie));}
export function workingCount(e,rows,readEffort){
 const groups=new Map();
 for(const x of matching(e,rows)){if(readEffort(x.origine).tipo_serie!=='allenante'||!String(x.unita_carico||'').includes(' | palestra ')||!String(x.unita_carico||'').includes(' | attrezzo '))continue;
 const num=Number(x.numero_serie);if(!Number.isInteger(num)||num<1||x.carico_kg===''||x.carico_kg==null||!Number.isFinite(Number(x.carico_kg))||Number(x.carico_kg)<0||!Number.isInteger(Number(x.ripetizioni))||Number(x.ripetizioni)<1)continue;
 const key=norm(x.esercizio)+'|'+norm(x.unita_carico);if(!groups.has(key))groups.set(key,new Map());const m=groups.get(key);m.set(num,(m.get(num)||0)+1);}
 return Math.max(0,...[...groups.values()].map(m=>[...m.values()].filter(v=>v===1).length));
}
export function unitParts(unit){const m=String(unit||'').match(/^(.+?) \| palestra (A|B) \| attrezzo (.+)$/);return m?{type:m[1],gym:m[2],equipment:m[3]}:null;}
export function nextSet(e,rows){const occupied=new Set(matching(e,rows).map(x=>Number(x.numero_serie)));for(let i=1;i<=25;i++)if(!occupied.has(i))return i;return null;}
// GIF89a, 256-color fixed RGB palette; LZW resets before code width grows.
export function encodeGif(width,height,frames,delay=85){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1024||height>1024||!frames.length||frames.some(x=>x.length!==width*height*4))throw Error('Fotogrammi non validi');
 const b=[],u=n=>b.push(n&255,(n>>8)&255),s=x=>{for(const c of x)b.push(c.charCodeAt(0));};
 s('GIF89a');u(width);u(height);b.push(247,0,0);
 for(let i=0;i<256;i++)b.push(Math.round((i>>5)*255/7),Math.round(((i>>2)&7)*255/7),(i&3)*85);
 b.push(33,255,11);s('NETSCAPE2.0');b.push(3,1,0,0,0);
 for(const frame of frames){b.push(33,249,4,4);u(delay);b.push(0,0,44);u(0);u(0);u(width);u(height);b.push(0,8);
 const bytes=[];let bits=0,buf=0;const code=c=>{buf|=c<<bits;bits+=9;while(bits>=8){bytes.push(buf&255);buf>>>=8;bits-=8;}};
 for(let p=0;p<frame.length;p+=4){if(p%800===0)code(256);code((frame[p]&224)|((frame[p+1]&224)>>3)|(frame[p+2]>>6));}code(257);if(bits)bytes.push(buf&255);
 for(let i=0;i<bytes.length;i+=255){const chunk=bytes.slice(i,i+255);b.push(chunk.length,...chunk);}b.push(0);}
 b.push(59);return new Uint8Array(b);
}
export async function photoGif(frames){
 const images=await Promise.all(frames.map(src=>new Promise((res,rej)=>{const img=new Image();img.crossOrigin='anonymous';img.referrerPolicy='no-referrer';img.onload=()=>res(img);img.onerror=rej;img.src=src;})));
 const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const data=images.map(img=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,320,240);const scale=Math.min(320/img.width,240/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,(320-w)/2,(240-h)/2,w,h);return ctx.getImageData(0,0,320,240).data;});
 return URL.createObjectURL(new Blob([encodeGif(320,240,data)],{type:'image/gif'}));
}
