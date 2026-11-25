/**
 * Recipe math, pure and conservative. The cooked yield is REQUIRED to compute
 * consumed macros from a cooked portion (pasta, fish, peas, etc).
 * No brand-specific values; user supplies label values per 100 g.
 */
const FIELDS = ['kcal','proteine','carboidrati','grassi','fibre'];
const round = (v,p=2) => Number(v.toFixed(p));
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const finiteNonNegative = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function calculateRecipe({ingredients, cooked_yield_g, serving_cooked_g}) {
  if (!Array.isArray(ingredients) || !ingredients.length) throw new Error('Ricetta senza ingredienti');
  const total = Object.fromEntries(FIELDS.map(k=>[k,0]));
  for (const ingredient of ingredients) {
    if (!ingredient || typeof ingredient.name !== 'string' || !ingredient.name.trim() ||
        !positive(ingredient.raw_g)) throw new Error('Nome o quantità ingrediente non valida');
    for (const field of FIELDS) {
      const per100=ingredient.per100?.[field];
      if (!finiteNonNegative(per100)) throw new Error('Dati nutrizionali mancanti o non validi: '+field+' / '+ingredient.name);
      total[field]+=per100*ingredient.raw_g/100;
    }
  }
  const base={
    status:'recipe_calculated',total_ingredients_raw_g:round(ingredients.reduce((s,i)=>s+i.raw_g,0)),
    recipe_total:Object.fromEntries(FIELDS.map(k=>[k,round(total[k])])),
    cooked_yield_g:positive(cooked_yield_g)?cooked_yield_g:null,
    serving_cooked_g:positive(serving_cooked_g)?serving_cooked_g:null,
    serving:null
  };
  if (!positive(cooked_yield_g)) return {...base,status:'missing_cooked_yield',
    warning:'Peso totale cotto mancante: la quantità consumata non basta per ricavare le kcal della porzione.'};
  if (!positive(serving_cooked_g)) return {...base,status:'missing_serving',
    warning:'Porzione cotta non indicata.'};
  if (serving_cooked_g > cooked_yield_g) throw new Error('La porzione supera la resa cotta della ricetta');
  const fraction=serving_cooked_g/cooked_yield_g;
  return {...base,serving_fraction:round(fraction,6),
    serving:Object.fromEntries(FIELDS.map(k=>[k,round(total[k]*fraction)])),
    assumption:'Ingredienti e olio distribuiti uniformemente nel piatto.'};
}
