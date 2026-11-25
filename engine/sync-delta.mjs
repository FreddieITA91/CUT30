/**
 * CUT30 non-destructive Google Sheets sync planner.
 * Produces only row-level updates and new-row appends; NEVER table rewrites.
 * The caller must verify remote state after the write.
 */
const a1Column = count => {
  let out='';
  while(count){count--;out=String.fromCharCode(65+count%26)+out;count=Math.floor(count/26);}
  return out;
};
const timeValue = iso => Number.isFinite(Date.parse(iso)) ? Date.parse(iso) : 0;
const same = (a,b) => String(a??'')===String(b??'');
function objectFromRow(head,row){const rec={};head.forEach((h,i)=>{rec[h]=row?.[i]??''});return rec;}
function valuesFromObject(head,obj){return head.map(key=>obj?.[key]??'');}
const latestId = (rows,key) => {
  const out=new Map();
  for(const x of rows)if(x?.[key]){
    const old=out.get(String(x[key]));
    if(!old || timeValue(x.updated_at)>=timeValue(old.updated_at))out.set(String(x[key]),x);
  }
  return out;
};

export function planDeltaSync({headersByTab,localTables,remoteRanges,dirtyConfig=[],lastSync=null}){
  const merged={};const updates=[];const appends=[];const warnings=[];
  for(const [tab,headers] of Object.entries(headersByTab)){
    const raw=remoteRanges[tab]||[];
    if(!raw.length || headers.some((h,i)=>String(raw[0]?.[i]??'')!==h))
      throw new Error('Schema cloud mancante o diverso, nessuna scrittura: '+tab);
    // preserve original 1-indexed spreadsheet row numbers for safe targeted updates
    const remote=raw.slice(1).map((r,i)=>({rowNumber:i+2,record:objectFromRow(headers,r)}))
      .filter(x=>x.record[headers[0]]!=='');
    const key=tab==='Config'?'chiave':'id';
    const byRemote=new Map();
    for(const item of remote){
      const id=String(item.record[key]||'');
      if(!id)continue;
      const prev=byRemote.get(id);
      if(!prev || timeValue(item.record.updated_at)>=timeValue(prev.record.updated_at))byRemote.set(id,item);
    }
    const mergedMap=new Map([...byRemote].map(([k,x])=>[k,x.record]));
    const local=latestId(localTables[tab]||[],key);
    const append=[];
    for(const [id,rec] of local){
      if(tab==='Config' && !dirtyConfig.includes(id))continue;
      const server=byRemote.get(id);
      if(!server){
        append.push(valuesFromObject(headers,rec));mergedMap.set(id,rec);
        continue;
      }
      if(tab==='Config'){
        if(headers.some(h=>!same(rec[h],server.record[h]))){
          updates.push({range:"'"+tab+"'!A"+server.rowNumber+':'+a1Column(headers.length)+server.rowNumber,values:[valuesFromObject(headers,rec)]});
          mergedMap.set(id,rec);
        }
        continue;
      }
      const localTime=timeValue(rec.updated_at), remoteTime=timeValue(server.record.updated_at);
      if(localTime>remoteTime){
        // Local record changed after last successful sync while remote was also
        // edited later than that sync -> do not silently resolve.
        if(lastSync && remoteTime>timeValue(lastSync) && localTime>timeValue(lastSync))
          throw new Error('Conflitto simultaneo: '+tab+' / '+id+'. Salva un backup e riconcilia prima di sincronizzare.');
        if(headers.some(h=>!same(rec[h],server.record[h]))){
          updates.push({range:"'"+tab+"'!A"+server.rowNumber+':'+a1Column(headers.length)+server.rowNumber,values:[valuesFromObject(headers,rec)]});
        }
        mergedMap.set(id,rec);
      }else if(localTime<remoteTime && lastSync && localTime>timeValue(lastSync) && remoteTime>timeValue(lastSync)){
        throw new Error('Conflitto simultaneo: '+tab+' / '+id+'. Salva un backup e riconcilia prima di sincronizzare.');
      }
    }
    if(append.length)appends.push({tab,range:"'"+tab+"'!A:"+a1Column(headers.length),values:append});
    merged[tab]=[...mergedMap.values()];
  }
  return {merged,updates,appends,warnings,counts:{updated:updates.length,inserted:appends.reduce((n,x)=>n+x.values.length,0)}};
}
