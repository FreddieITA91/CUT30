import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as cardio from '../engine/cardio-segments.mjs';
import * as flow from '../engine/fitness-p0.mjs';
const source=readFileSync(new URL('../cut30-engine-bridge.js',import.meta.url),'utf8');
const day='2026-11-26';
function ui(rows=[],workout=null,ready=true){
 const state={prefs:{sheetId:'diary'}},window={};
 const injected=source.replace(/\}\)\(\);\s*$/,'cardioEngine=cardio;flowEngine=flow;cache.CardioSegmenti=rows;cardioSource=ready?"diary":null;cardioLoaded=ready;window.api={cardioRegistered,segmentPanel};})();');
 runInNewContext(injected,{window,state,cardio,flow,rows,ready,document:{readyState:'loading',addEventListener(){}},selectedDate:day,localDate:()=>day,programFor:()=> 'Upper B',trainingFor:()=>workout,dayLabel:d=>d,h:String,token:'mock',tokenExpires:Date.now()+999999,fmtN:Number});
 return window.api;
}
const r=(data,numero_segmento,modalita,durata_min,extra={})=>cardio.validateCardioSegment({data,numero_segmento,modalita,durata_min,programma:'Upper B',...extra});
test('registered activities visible separately from the collapsed add form',()=>{const x=ui([r(day,1,'tapis',20,{distanza_km:2,pendenza_pct:4,fc_media:130}),r(day,2,'piscina',10,{passo_sec_100m:120}),r('2026-11-20',1,'cyclette',15)]);const html=x.cardioRegistered();assert.match(html,/Cardio registrato/);assert.match(html,/30 min/);assert.match(html,/Tapis roulant/);assert.match(html,/Nuoto \/ piscina/);assert.match(html,/Pendenza/);assert.match(html,/2:00/);assert.match(html,/data-wl-cardio-edit/);assert.match(html,/data-wl-cardio-day="2026-11-20"/);assert.doesNotMatch(html,/cut30-cardio-form/);assert.doesNotMatch(x.segmentPanel(),/wl-cardio-record/);});
test('legacy totals not invented as individual activities; unavailable detail explicit',()=>{const x=ui([],{durata_cardio_min:25});assert.match(x.cardioRegistered(),/25 min/);assert.match(x.cardioRegistered(),/senza dettaglio/);assert.doesNotMatch(x.cardioRegistered(),/wl-cardio-record/);assert.match(ui([],{durata_cardio_min:25},false).cardioRegistered(),/non disponibile/);});
