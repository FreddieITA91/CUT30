import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {buildTrainingLevel} from '../engine/training-level.mjs';
const source=readFileSync(new URL('../experience.js',import.meta.url),'utf8');
function renderLevel(mode){
 const globals={window:{},document:{readyState:'loading',addEventListener(){}},renderDashboard(){},renderProgress(){},renderNutrition(){},render(){},h:String,localDate:()=> '2026-11-26',state:{tables:{Allenamenti:[]},prefs:{}},cfg:()=> '2026-11-02',buildTrainingLevel,mode,console:{error(){}}};
 const injected=source.replace(/\}\)\(\);\s*$/,'if(mode==="ready")levelEngine={buildTrainingLevel};if(mode==="error"){levelEngine={buildTrainingLevel:()=>{throw Error("Dati non validi")}};}window.output=[xpBanner(),fullDashboard()];})();');
 runInNewContext(injected,globals);return globals.window.output;
}
test('level is visible even before the tracker module is available',()=>{const [tile,dash]=renderLevel('loading');assert.match(tile,/Livello CUT30/);assert.match(tile,/Caricamento esperienza/);assert.match(dash,/Livello CUT30/);});
test('independent level module displays 1/100 and 0 XP even without history',()=>{const [tile,dash]=renderLevel('ready');assert.match(tile,/<strong>1<\/strong>/);assert.match(tile,/0 XP/);assert.match(dash,/class="fit-level"/);});
test('level errors never disappear silently; retry visible',()=>{const [tile,dash]=renderLevel('error');assert.match(tile,/Dati non validi/);assert.match(tile,/data-level-retry/);assert.match(dash,/Livello CUT30/);});
