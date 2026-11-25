/**
 * Daily CUT30 analytics — fetches private Sheets with a service account and
 * upserts ONLY a derived row in the same private spreadsheet. No user data in Git.
 * No third-party Node packages required; Node 22 native fetch + crypto.
 */
import {createSign} from 'node:crypto';
import {buildReport} from './cut30.mjs';

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
  if(!meta.sheets?.some(x=>x.properties?.title===name)){
    await api(root+':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{addSheet:{properties:{title:name}}}]})});
  }
  const input=['Nutrizione','Allenamenti','Esercizi','Carichi','Misure','Valutazioni'];
  const ranges=input.map(x=>"'"+x+"'!A1:O5000");
  ranges.push("'"+name+"'!A1:P5000");
  const params=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE'});
  for(const r of ranges)params.append('ranges',r);
  const result=await api(root+'/values:batchGet?'+params);
  const tables=Object.fromEntries(input.map((k,i)=>[k,result.valueRanges?.[i]?.values||[]]));
  const asOf=new Date().toISOString().slice(0,10);
  const report=buildReport(tables,asOf);
  const act=report.activity,nut=report.nutrition,w=report.weight_pre;
  const numbers=(x)=>x==null?'':x;
  const values=[
    asOf,new Date().toISOString(),act.workouts_completed,act.weights_minutes,
    act.cardio_minutes,act.tracker_estimated_kcal,nut.days_logged,
    nut.three_meal_days,numbers(nut.average_kcal_complete_days),
    numbers(nut.average_protein_g_complete_days),numbers(w.latest_kg),
    numbers(w.kg_per_week),act.recorded_sets,numbers(act.average_rating),
    report.warnings.join(' | '),report.schema_version
  ];
  const existing=result.valueRanges?.[input.length]?.values||[];
  const oldRow=existing.findIndex((r,i)=>i>0&&r[0]===asOf)+1;
  if(existing.length && existing[0].some((v,i)=>v!==columns[i]))
    throw new Error('AnalisiAuto has unexpected schema; refusing to overwrite it');
  const range="'"+name+"'!A"+(oldRow||Math.max(existing.length+1,2))+':P'+(oldRow||Math.max(existing.length+1,2));
  if(!existing.length){
    await api(root+'/values/'+encodeURIComponent("'"+name+"'!A1:P1")+'?valueInputOption=RAW',
      {method:'PUT',body:JSON.stringify({values:[columns]})});
  }
  await api(root+'/values/'+encodeURIComponent(range)+'?valueInputOption=RAW',
    {method:'PUT',body:JSON.stringify({values:[values]})});
  console.log('CUT30_AUTO: report saved privately to Google Sheets (date '+asOf+'). No personal metrics printed.');
}

main().catch(err=>{console.error('CUT30_AUTO: FAILED — '+err.message);process.exitCode=1});
