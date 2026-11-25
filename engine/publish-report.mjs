/**
 * Daily CUT30 analytics — fetches private Sheets with a service account and
 * upserts ONLY a derived row in the same private spreadsheet. No user data in Git.
 * No third-party Node packages required; Node 22 native fetch + crypto.
 */
import {createSign} from 'node:crypto';
import {buildDailyCycle,romeDate,cycleRow,planDailyWrite,CYCLE_HEADERS} from './orchestrator.mjs';

const name = 'AnalisiAuto';
const columns = [
  'data_analisi','generato_utc','sessioni_completate_14g','pesi_min_14g',
  'cardio_min_14g','kcal_dispositivo_14g','giorni_alimentazione_14g',
  'giorni_tre_pasti_14g','kcal_media_giorni_3pasti','proteine_medie_g_3pasti',
  'peso_pre_kg','tendenza_kg_settimana','serie_registrate_14g',
  'voto_medio_14g','avvisi','versione_engine'
];

async function getToken(credentials) {
  const now = Math.floor(Date.now()/1000);
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const url = 'https://oauth2.googleapis.com/token';
  const unsigned = b64({alg:'RS256',typ:'JWT'}) + '.' + b64({
    iss:credentials.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',
    aud:url,iat:now,exp:now+3600
  });
  const sign=createSign('RSA-SHA256');sign.update(unsigned);sign.end();
  const jwt=unsigned+'.'+sign.sign(credentials.private_key).toString('base64url');
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});
  if(!res.ok)throw new Error('Google OAuth status '+res.status);
  const body=await res.json();
  if(!body.access_token)throw new Error('Google OAuth token missing');
  return body.access_token;
}

async function main() {
  const rawCred=process.env.CUT30_GOOGLE_SERVICE_ACCOUNT_JSON;
  const spreadsheetId=process.env.CUT30_SPREADSHEET_ID;
  if(!rawCred || !spreadsheetId){
    console.log('CUT30_AUTO: DISABLED — configure GitHub Actions secrets to enable daily private report.');
    return;
  }
  const cred=JSON.parse(rawCred);
  if(!cred.client_email || !cred.private_key)throw new Error('Service account credentials invalid');
  const token=await getToken(cred);
  const root='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheetId);
  async function api(url,options={}) {
    const res=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,
      ...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
    if(!res.ok)throw new Error('Google Sheets API status '+res.status);
    return res.status===204?{}:res.json();
  }
  const meta=await api(root+'?fields=sheets.properties.title');
  const titles=new Set(meta.sheets?.map(x=>x.properties?.title)||[]);
  const required=['Config','Nutrizione','Allenamenti','Esercizi','Carichi','Misure','Valutazioni','Calendario'];
  const optional=['CardioSegmenti','SchedeConfermate','AuditPrestazioni'];
  if(required.some(t=>!titles.has(t)))throw Error('Input required tab missing');
  const input=[...required,...optional.filter(t=>titles.has(t))];
  const params=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE'});
  for(const t of input)params.append('ranges',"'"+t+"'!A:O");
  const result=await api(root+'/values:batchGet?'+params);
  if(result.valueRanges?.length!==input.length)throw Error('Input read incomplete');
  const tables=Object.fromEntries(input.map((k,i)=>[k,result.valueRanges[i].values||[]]));
  const asOf=romeDate(),at=new Date().toISOString();
  const cycle=buildDailyCycle(tables,asOf);
  const report=cycle.report,act=report.activity,nut=report.nutrition,w=report.weight_pre;
  const val=x=>x==null?'':x;
  const values=[asOf,at,act.workouts_completed,act.weights_minutes,act.cardio_minutes,act.tracker_estimated_kcal,nut.days_logged,
    nut.three_meal_days,val(nut.average_kcal_complete_days),val(nut.average_protein_g_complete_days),val(w.latest_kg),val(w.kg_per_week),
    act.recorded_sets,val(act.average_rating),report.warnings.join(' | '),report.schema_version];
  const outputs=[{title:name,head:columns,row:values},{title:'CicloAuto',head:CYCLE_HEADERS,row:cycleRow(cycle,at)}];
  // Validate existing output schemas before any write.
  for(const o of outputs){
    o.end=String.fromCharCode(64+o.head.length);
    o.range="'"+o.title+"'!A:"+o.end;
    o.read=root+'/values/'+encodeURIComponent(o.range)+'?valueRenderOption=UNFORMATTED_VALUE';
    const existing=titles.has(o.title)?(await api(o.read)).values||[]:[];
    o.write=planDailyWrite(existing,o.head,o.row);
  }
  for(const o of outputs){
    if(!titles.has(o.title))await api(root+':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{addSheet:{properties:{title:o.title,gridProperties:{rowCount:1000,columnCount:o.head.length,frozenRowCount:1}}}}]})});
    const current=(await api(o.read)).values||[];
    o.write=planDailyWrite(current,o.head,o.row);
    const put=async(range,row)=>api(root+'/values/'+encodeURIComponent(range)+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values:[row]})});
    if(o.write.headerNeeded)await put("'"+o.title+"'!A1:"+o.end+'1',o.head);
    const r=o.write.rowNumber;
    if(r>current.length)await api(root+'/values/'+encodeURIComponent(o.range)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',body:JSON.stringify({values:[o.row]})});
    else await put("'"+o.title+"'!A"+r+':'+o.end+r,o.row);
    const after=(await api(o.read)).values||[];
    const matches=after.slice(1).filter(x=>x[0]===asOf);
    if(matches.length!==1||o.head.some((_,i)=>String(matches[0][i]??'')!==String(o.row[i]??'')))throw Error('Output verification failed');
  }
  console.log('CUT30_AUTO: private daily report and cycle verified. No personal metrics printed.');
}

main().catch(()=>{console.error('CUT30_AUTO: FAILED — private processing or output verification failed; check configuration and schemas.');process.exitCode=1});
