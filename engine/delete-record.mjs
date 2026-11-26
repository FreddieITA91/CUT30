// Targeted, verified deletion. Clear cells only: never shift unrelated rows.
const text=v=>String(v??'');
export function locateRecord(values,headers,expected){
 if(!Array.isArray(values)||!values.length||headers.some((k,i)=>text(values[0]?.[i])!==k))throw Error('Schema inatteso: nessuna cancellazione');
 if(!expected?.id)throw Error('Registrazione non identificata');
 const found=values.map((row,i)=>i>0&&text(row?.[0])===text(expected.id)?i:-1).filter(i=>i>0);
 if(found.length!==1)throw Error(found.length?'ID duplicato: riconciliare prima di cancellare':'Registrazione non più disponibile: aggiorna');
 const i=found[0];
 if(headers.some((k,j)=>text(values[i][j])!==text(expected[k])))throw Error('Registrazione modificata nel cloud: aggiorna prima di cancellare');
 return i+1;
}
export async function deleteVerified({api,assertSource,table,headers,expected}){
 if(!['Carichi','CardioSegmenti'].includes(table))throw Error('Tabella non autorizzata alla cancellazione');
 const call=async(...args)=>{assertSource();const r=await api(...args);assertSource();return r;};
 const end=String.fromCharCode(64+headers.length),range="'"+table+"'!A:"+end,read='/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE';
 const before=(await call(read)).values||[],row=locateRecord(before,headers,expected);
 const second=(await call(read)).values||[];
 if(locateRecord(second,headers,expected)!==row)throw Error('Riga spostata nel cloud: aggiorna');
 const target="'"+table+"'!A"+row+":"+end+row;
 await call('/values/'+encodeURIComponent(target)+':clear','POST',{});
 const after=(await call(read)).values||[];
 if(!after.length||headers.some((k,i)=>text(after[0]?.[i])!==k)||after.slice(1).some(r=>text(r?.[0])===text(expected.id))||headers.some((_,i)=>text(after[row-1]?.[i])!==''))throw Error('Cancellazione non verificata: aggiorna prima di riprovare');
 return after;
}
