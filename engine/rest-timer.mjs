// Recovery is prescribed by the confirmed exercise plan, never inferred from calories.
export function recoverySeconds(exercise){
 const raw=String(exercise?.rest??'').trim().toLowerCase();
 const match=raw.match(/^(\d+)(?:\s*[-–—]\s*(\d+))?\s*(sec(?:ondi)?|s|min(?:uti)?)$/);
 if(!match)return null;
 const a=Number(match[1]),b=Number(match[2]??match[1]),scale=match[3].startsWith('min')?60:1;
 if(a<=0||b<a||b*scale>600)return null;
 return b*scale; // conservative end of prescribed range
}
export function shouldStartRecovery({date,today,editing=false,verified=false,hasNext=false,exercise}){
 return verified&&!editing&&date===today&&hasNext&&recoverySeconds(exercise)!==null;
}
export function startRecovery({exercise,recordId,date,now}){
 const seconds=recoverySeconds(exercise);
 if(!seconds||!Number.isFinite(now))return null;
 return {recordId,date,name:String(exercise.name||''),seconds,deadline:now+seconds*1000};
}
export function remainingSeconds(timer,now){
 return timer?Math.max(0,Math.ceil((timer.deadline-now)/1000)):0;
}
export function extendRecovery(timer,now,seconds=30){
 if(!timer||!Number.isFinite(now)||!Number.isInteger(seconds)||seconds<=0||seconds>120)return timer;
 const base=Math.max(timer.deadline,now),deadline=Math.min(base+seconds*1000,now+600000);
 return {...timer,deadline,seconds:Math.max(timer.seconds,Math.ceil((deadline-now)/1000))};
}
export function formatRecovery(seconds){
 const s=Math.max(0,Math.ceil(seconds));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}
