export function recipePlannerTotals(recipes, inventory, recipeId, requestedQuantity) {
  const recipe = recipes.find(candidate => candidate.id === recipeId);
  if (!recipe) throw new Error(`Unknown recipe: ${recipeId}`);
  const requested = Math.max(1, Math.floor(Number(requestedQuantity) || 1));
  const productQuantity = Math.max(1, recipe.product.quantity || 1);
  const crafts = Math.ceil(requested / productQuantity);
  const byProduct = new Map();
  for (const candidate of recipes) {
    const key = candidate.product.itemId || `name:${candidate.product.name.toLocaleLowerCase()}`;
    if (!byProduct.has(key)) byProduct.set(key, candidate);
  }
  const totals = new Map();
  function addBase(component, quantity) {
    const key = component.itemId || `unsupported:${component.name.toLocaleLowerCase()}`;
    if (!totals.has(key)) totals.set(key, { ...component, total: 0 });
    totals.get(key).total += quantity;
  }
  function expand(component, required, stack) {
    const key = component.itemId || `name:${component.name.toLocaleLowerCase()}`;
    const dependency = byProduct.get(key);
    if (!dependency || !dependency.product.quantity) return addBase(component, required);
    if (stack.has(dependency.id)) throw new Error(`Crafting dependency cycle at ${dependency.product.name}`);
    const ownedIntermediate = component.itemId ? Math.max(0, inventory[component.itemId] || 0) : 0;
    const remaining = Math.max(0, required - ownedIntermediate);
    if (!remaining) return;
    const dependencyCrafts = Math.ceil(remaining / dependency.product.quantity);
    const nextStack = new Set(stack);
    nextStack.add(dependency.id);
    for (const child of dependency.components) expand(child, child.quantity * dependencyCrafts, nextStack);
  }
  for (const component of recipe.components) expand(component, component.quantity * crafts, new Set([recipe.id]));
  const components = [...totals.values()].map(component => {
    const owned = component.itemId ? Math.max(0, inventory[component.itemId] || 0) : null;
    return { ...component, owned, missing: owned == null ? null : Math.max(0, component.total - owned) };
  });
  return { recipe, requested, crafts, components };
}
