'use strict';
const data = require('../data/weapon-builds.canonical.json');
const audit = require('../data/weapon-build-audit.json');

const CORE_SLOTS = new Set(['Barrel','Gas Tube','Grip','Handguard','Magazine','Stock','Upper Assembly','Upper assembly','Receiver','Trigger','Muzzle Device','Optic','Scope','Foregrip']);
const precision = category => /heavy|precision|sniper/i.test(category);
const close = category => /pistol|submachine|shotgun/i.test(category);
function categoryGroup(category) {
  const closeMatch = /pistol|submachine|shotgun/i.test(category);
  const precisionMatch = /heavy|precision|sniper/i.test(category);
  if (precisionMatch) return 'heavy';
  if (closeMatch) return 'close';
  return 'standard';
}
// Shotguns and grenade launchers are the community's explicitly-called-out
// exception to "unsuppressed = constant aggro": they're accepted as loud by
// design (see the community tier writeup this scoring is calibrated
// against), so the suppression dimension is left out of their weight budget
// entirely instead of scoring them against a standard they can't meet.
const SUPPRESSION_EXEMPT = /shotgun|grenade launcher/i;
// Weights reflect community consensus on what actually matters for survival
// (see the tier-list writeup this was calibrated against): suppression and
// magazine/drum capacity dominate because unsuppressed fire draws map-wide
// aggro and reloading mid-patrol-wipe is a death sentence; damage carries
// more weight for 'heavy' since one-tap alpha damage is the entire point of
// anti-materiel/marksman rifles. accuracy/stability/rof are real but
// secondary -- most weapons cluster tightly on those stats in this dataset,
// so they're not what separates an S-tier pick from a B-tier one.
const CATEGORY_WEIGHTS = {
  heavy:    { accuracy: 20, stability: 16, recoil: 8,  damage: 24, rof: 4,  magazine: 12, suppression: 14 },
  close:    { accuracy: 16, stability: 12, recoil: 10, damage: 18, rof: 10, magazine: 18, suppression: 18 },
  standard: { accuracy: 16, stability: 14, recoil: 12, damage: 20, rof: 8,  magazine: 20, suppression: 16 }
};
// Only dimensions actually populated anywhere in weapon-builds.canonical.json
// -- adsSpeed/reloadSpeed are declared on every part but never non-zero (no
// attachment moves them, and no weapon's base stats carry them either), so
// including them would only ever contribute a constant, non-discriminating
// 0.5 percentile. Keeping only live dimensions in the weight budget.
const DIM_WEIGHT_KEYS = ['accuracy', 'stability', 'recoil', 'damage', 'rof', 'magazine'];
const REVERSED_DIMS = new Set(['recoil']);

function rawContribution(part, category) {
  const s = part.stats;
  const w = (CATEGORY_WEIGHTS[categoryGroup(category)] || CATEGORY_WEIGHTS.standard);
  // recoilWrist/recoilArm deltas are always <= 0 in this dataset (attachments
  // only ever reduce recoil, never add it), so negating their sum turns "more
  // reduction" into a positive contribution. s.damage is always 0 for parts
  // (no attachment alters base damage -- see fetch-wiki-items.js's item
  // description work for the same observation on the Items side) but is
  // kept with the correct positive-is-good sign for forward compatibility.
  let score = s.accuracy*w.accuracy + s.stability*w.stability - (s.recoilWrist + s.recoilArm)*w.recoil + s.damage*w.damage + s.rof*w.rof + s.magazine*w.magazine;
  if (/optic|scope/i.test(part.slot)) {
    const target = close(category) ? 70 : precision(category) ? 30 : 50;
    score += 25 - Math.min(25, Math.abs(s.fov - target) * .5);
  }
  return Number(score.toFixed(4));
}
function contribution(part, category) { return Number(rawContribution(part, category).toFixed(4)); }

// Part selection only -- no percentile/score dependency, so this can run
// standalone to seed the percentile pools below before any score exists.
function pickParts(weapon) {
  const compatible=weapon.parts.filter(part=>part.itemId&&CORE_SLOTS.has(part.slot));
  const ranked=(items)=>[...items].sort((a,b)=>rawContribution(b,weapon.category)-rawContribution(a,weapon.category)||a.name.localeCompare(b.name));
  const suppressed=ranked(compatible.filter(part=>part.suppressed))[0]||null;
  const bestBySlot=new Map();for(const part of compatible){const slot=/optic|scope/i.test(part.slot)?'optic':part.slot.toLowerCase(),current=bestBySlot.get(slot);if(!current||ranked([part,current])[0]===part)bestBySlot.set(slot,part);}if(suppressed)bestBySlot.set('muzzle device',suppressed);
  const selected=new Map(),locked=new Set();
  const choose=(part,lock=false)=>{const slot=/optic|scope/i.test(part.slot)?'optic':part.slot.toLowerCase();if(locked.has(slot)&&!lock)return;selected.set(slot,part);if(lock)locked.add(slot);};
  const ordered=ranked([...bestBySlot.values()]).sort((a,b)=>(b.suppressed-a.suppressed)||((/optic|scope/i.test(b.slot)?1:0)-(/optic|scope/i.test(a.slot)?1:0)));
  for(const part of ordered){if(rawContribution(part,weapon.category)<=0&&!part.suppressed&&!/magazine|optic|scope/i.test(part.slot))continue;choose(part);if(part.dependencies.length){const alternatives=part.dependencies.map(dep=>compatible.find(candidate=>candidate.itemId===dep.itemId)).filter(Boolean);const dependency=ranked(alternatives)[0];if(dependency)choose(dependency,true);}}
  const result=[...selected.values()].sort((a,b)=>a.slot.localeCompare(b.slot)||a.name.localeCompare(b.name));
  return result.map(part=>({...part,score:contribution(part,weapon.category)}));
}

// Sum of base weapon stat + every selected BIS part's delta, per dimension.
// This is the unit the percentile pools below are built from -- comparing a
// build's total against a pool of OTHER builds' totals, not against a mix of
// unsummed individual part deltas (which is what this used to do: since
// summing several positive deltas together almost always beats any single
// unsummed component, every weapon was landing near the top of the range on
// every dimension regardless of how good its actual build was).
function buildTotals(weapon, selectedParts) {
  const totals = selectedParts.reduce((acc, p) => {
    const ps = p.stats || {};
    acc.accuracy += ps.accuracy || 0;
    acc.stability += ps.stability || 0;
    acc.recoil += (ps.recoilWrist || 0) + (ps.recoilArm || 0);
    acc.damage += ps.damage || 0;
    acc.rof += ps.rof || 0;
    acc.magazine += ps.magazine || 0;
    return acc;
  }, { accuracy: 0, stability: 0, recoil: 0, damage: 0, rof: 0, magazine: 0 });
  const s = weapon.stats || {};
  totals.accuracy += s.accuracy || 0;
  totals.stability += s.stability || 0;
  totals.recoil += s.recoil ?? ((s.recoilWrist || 0) + (s.recoilArm || 0));
  totals.damage += s.damage || 0;
  totals.rof += s.rof || 0;
  totals.magazine += s.magazine || 0;
  return totals;
}

// Percentile pools: one entry per WEAPON per category (its own best-build
// total), not per part. A category with fewer than 2 weapons (e.g. Heavy
// Machinegun, which today has only "Painless") can't be meaningfully ranked
// against peers, so _dimPercentile falls back to a neutral 0.5 rather than
// producing an arbitrary near-0 or near-100 outlier from a degenerate pool.
const _catDimArrays = {};
for (const weapon of data.weapons) {
  const totals = buildTotals(weapon, pickParts(weapon));
  for (const k of DIM_WEIGHT_KEYS) {
    (_catDimArrays[k] ??= {});
    (_catDimArrays[k][weapon.category] ??= []).push(totals[k]);
  }
}
for (const k of Object.keys(_catDimArrays)) {
  for (const cat of Object.keys(_catDimArrays[k])) _catDimArrays[k][cat].sort((a, b) => a - b);
}

function _dimPercentile(value, category, dimKey) {
  const arr = _catDimArrays[dimKey]?.[category];
  if (!arr || arr.length < 2) return 0.5;
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < value) lo = mid + 1; else hi = mid; }
  return lo / arr.length;
}
function selectBuild(weapon) {
  const parts = pickParts(weapon);
  const score = balancePercentile(weapon, parts);
  return{parts,score,suppressed:parts.some(p=>p.suppressed),suppressionMessage:parts.some(p=>p.suppressed)?'Suppressed':'No compatible suppressor.'};
}
function balancePercentile(weapon, selectedParts) {
  const totals = buildTotals(weapon, selectedParts);
  const w = (CATEGORY_WEIGHTS[categoryGroup(weapon.category)] || CATEGORY_WEIGHTS.standard);

  let pctSum = 0, weightBudget = 0;
  for (const k of DIM_WEIGHT_KEYS) {
    const pct = _dimPercentile(totals[k], weapon.category, k);
    const effectivePct = REVERSED_DIMS.has(k) ? (1 - pct) : pct;
    pctSum += w[k] * effectivePct;
    weightBudget += w[k];
  }
  if (!SUPPRESSION_EXEMPT.test(weapon.category)) {
    pctSum += w.suppression * (selectedParts.some(p => p.suppressed) ? 1 : 0);
    weightBudget += w.suppression;
  }
  return Number(Math.max(0, Math.min(100, (pctSum / weightBudget) * 100)).toFixed(2));
}
function getWeapon(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw Object.assign(new Error('Invalid weaponId'),{status:400});
  const weapon=data.weapons.find(item=>item.id===id); if(!weapon) throw Object.assign(new Error('Unsupported weapon mapping'),{status:404}); return weapon;
}
async function listBuilds(key) {
  const [inventory,xp] = await Promise.all([require('./gvasService').listInventoryItems(key), require('./saveService').listWeaponXp(key)]);
  const owned=new Map(inventory.map(i=>[i.name,i.quantity])); const xpRow=xp instanceof Array?xp:[];
  return { source:data.source, audit:audit.counts, categories:[...new Set(data.weapons.map(w=>w.category))].sort(), weapons:data.weapons.map(weapon=>{
    const build=selectBuild(weapon); const currentXp=xpRow.find(row=>String(row.weapon||row.scope||'').endsWith(weapon.id))?.xp||0;
    const parts=build.parts.map(part=>({...part,owned:owned.get(part.itemId)||0,missing:(owned.get(part.itemId)||0)<1,requirementMet:currentXp>=part.requiredXp}));
    return {...weapon,parts:undefined,weaponOwned:(owned.get(weapon.id)||0)>0,build:{...build,parts,owned:parts.filter(p=>!p.missing).length,missing:parts.filter(p=>p.missing).length},currentXp};
  })};
}
async function addMissing(key,id) {
  const weapon=getWeapon(id), build=selectBuild(weapon);
  if (!build.parts.length) throw Object.assign(new Error('No trusted compatible build is available'),{status:422});
  return require('./gvasService').ensureInventoryItems(key,build.parts.map(part=>({itemId:part.itemId,sourceMap:part.inventoryMap||'Items'})));
}
async function addMissingWithWeapon(key,id) {
  const weapon=getWeapon(id), build=selectBuild(weapon);
  const weaponSourceMap = weapon.inventoryMap === 'Weapons' ? 'Base Weapons' : (weapon.inventoryMap || 'Base Weapons');
  const items=[{itemId:weapon.id,sourceMap:weaponSourceMap},...build.parts.map(part=>({itemId:part.itemId,sourceMap:part.inventoryMap||'Items'}))];
  return require('./gvasService').ensureInventoryItems(key,items);
}
function getBuildPart(weaponId,partId) {
  const weapon=getWeapon(weaponId),build=selectBuild(weapon);
  if(typeof partId!=='string'||!/^[A-Za-z0-9._-]+$/.test(partId))throw Object.assign(new Error('Invalid partId'),{status:400});
  const part=build.parts.find(candidate=>candidate.itemId===partId);
  if(!part)throw Object.assign(new Error('Part is not in the trusted BIS build for this weapon'),{status:400});
  return{weapon,part};
}
async function addBuildPart(key,weaponId,partId) {
  const {weapon,part}=getBuildPart(weaponId,partId);
  const result=await require('./gvasService').ensureInventoryItems(key,[{itemId:part.itemId,sourceMap:part.inventoryMap||'Items'}]);
  return{...result,weapon:{id:weapon.id,name:weapon.name},part:{itemId:part.itemId,name:part.name,slot:part.slot}};
}
async function addMissingForOwnedWeapons(key) {
  const inventory=await require('./gvasService').listInventoryItems(key);
  const ownedIds=new Set(inventory.filter(item=>item.quantity>0).map(item=>item.name));
  const ownedWeapons=data.weapons.filter(weapon=>ownedIds.has(weapon.id)).map(weapon=>({weapon,build:selectBuild(weapon)})).filter(entry=>entry.build.parts.length);
  if(!ownedWeapons.length) throw Object.assign(new Error('No owned weapons with a trusted BIS build were found'),{status:409});
  const parts=new Map();for(const entry of ownedWeapons)for(const part of entry.build.parts)parts.set(part.itemId,{itemId:part.itemId,sourceMap:part.inventoryMap||'Items'});
  try {
    const result=await require('./gvasService').ensureInventoryItems(key,[...parts.values()]);
    return {...result,weapons:ownedWeapons.map(entry=>({id:entry.weapon.id,name:entry.weapon.name})),weaponCount:ownedWeapons.length,recommendedPartCount:parts.size};
  } catch(error) {
    if(error.status===409&&/already owned/.test(error.message)) throw Object.assign(new Error('All BIS parts for owned weapons are already present'),{status:409});
    throw error;
  }
}
module.exports={ contribution,selectBuild,getWeapon,getBuildPart,listBuilds,addMissing,addMissingWithWeapon,addBuildPart,addMissingForOwnedWeapons,balancePercentile };
