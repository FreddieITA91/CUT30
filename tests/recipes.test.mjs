import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateRecipe} from '../engine/recipes.mjs';

const ingredient=(name,raw_g,kcal,p=0,c=0,f=0,fi=0)=>({
  name,raw_g,per100:{kcal,proteine:p,carboidrati:c,grassi:f,fibre:fi}
});
const ingredients=[
  ingredient('pasta secca',300,350,12,70,1,3),
  ingredient('nasello',300,75,17,0,0.6),
  ingredient('piselli',300,80,5,13,0.4,5),
  ingredient('olio di oliva',40,900,0,0,100)
];
test('recipe only estimates a cooked serving if total cooked yield is known',()=>{
  const result=calculateRecipe({ingredients,serving_cooked_g:275});
  assert.equal(result.status,'missing_cooked_yield');
  assert.equal(result.serving,null);
  assert.equal(result.recipe_total.kcal,1875);
  assert.ok(result.warning.includes('Peso totale cotto'));
});
test('cooked recipe serving is ingredient-total × portion / cooked yield',()=>{
  const result=calculateRecipe({ingredients,cooked_yield_g:1500,serving_cooked_g:275});
  assert.equal(result.status,'recipe_calculated');
  assert.equal(result.serving_fraction,Number((275/1500).toFixed(6)));
  assert.equal(result.serving.kcal,343.75);
  assert.equal(result.serving.proteine,23.47);
});
test('reject bad ingredients, nonexistent nutritional values and impossible servings',()=>{
  assert.throws(()=>calculateRecipe({ingredients:[]}),/senza ingredienti/);
  assert.throws(()=>calculateRecipe({ingredients:[{name:'X',raw_g:100,per100:{kcal:20}}]}),/Dati nutrizionali/);
  assert.throws(()=>calculateRecipe({ingredients,cooked_yield_g:150,serving_cooked_g:275}),/supera la resa/);
  assert.throws(()=>calculateRecipe({ingredients:[{...ingredients[0],raw_g:-3}],cooked_yield_g:1500,serving_cooked_g:275}),/non valida/);
});
test('PWA loads addon without making the existing Sheets schema public',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const script=readFileSync(new URL('../cut30-engine-bridge.js',import.meta.url),'utf8');
  assert.ok(html.includes('cut30-engine-bridge.js'));
  assert.ok(script.includes("saveRow('Carichi',rec)"));
  assert.ok(script.includes("saveRow('Nutrizione',rec)"));
  assert.ok(!script.includes('private_key'));
});
