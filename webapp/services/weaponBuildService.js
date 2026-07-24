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
const CATEGORY_WEIGHTS = {
  heavy:   { accuracy: 25, stability: 25, recoil: -15, damage: 20, rof: 10, adsSpeed: 5, reloadSpeed: 5, magazine: 5 },
  close:   { accuracy: 25, stability: 20, recoil: -15, damage: 20, rof: 15, adsSpeed: 5, reloadSpeed: 10, magazine: 3 },
  standard:{ accuracy: 30, stability: 24, recoil: -18, damage: 12, rof: 8, adsSpeed: 7, reloadSpeed: 5, magazine: 3 }
};
const DIM_WEIGHT_KEYS = Object.keys(CATEGORY_WEIGHTS.standard).filter(k => k !== 'fov');
const REVERSED_DIMS = new Set(['recoil']);
const _catDimArrays = {};

DIM_WEIGHT_KEYS.forEach(k => {
  data.weapons.forEach(w => {
    const cat = w.category;
    if (!_catDimArrays[k]) _catDimArrays[k] = {};
    if (!_catDimArrays[k][cat]) _catDimArrays[k][cat] = [];
    const s = w.stats || {};
    let baseVal;
    if (k === 'recoil') baseVal = s.recoil || (s.recoilWrist + s.recoilArm);
    else baseVal = s[k];
    if (baseVal != null) _catDimArrays[k][cat].push(baseVal);
    (w.parts || []).filter(p => p.itemId && CORE_SLOTS.has(p.slot)).forEach(p => {
      const ps = p.stats;
      let val;
      if (k === 'recoil') val = (ps.recoilWrist || 0) + (ps.recoilArm || 0);
      else val = ps[k];
      if (val != null) _catDimArrays[k][cat].push(val);
    });
  });
  Object.entries(_catDimArrays[k]).forEach(([cat, arr]) => {
    _catDimArrays[k][cat] = arr.sort((a, b) => a - b);
  });
});

function _dimPercentile(value, category, dimKey) {
  const arr = _catDimArrays[dimKey]?.[category];
  if (!arr || !arr.length) return 0.5;
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < value) lo = mid + 1; else hi = mid; }
  return lo / arr.length;
}
function rawContribution(part, category) {
  const s = part.stats;
  const w = (CATEGORY_WEIGHTS[categoryGroup(category)] || CATEGORY_WEIGHTS.standard);
  let score = s.accuracy*w.accuracy + s.stability*w.stability - s.recoilWrist*w.recoil - s.recoilArm*w.recoil - s.damage*w.damage + s.rof*w.rof + s.adsSpeed*w.adsSpeed + s.reloadSpeed*w.reloadSpeed + s.magazine*w.magazine;
  if (/optic|scope/i.test(part.slot)) {
    const target = close(category) ? 70 : precision(category) ? 30 : 50;
    score += 25 - Math.min(25, Math.abs(s.fov - target) * .5);
  }
  return Number(score.toFixed(4));
}
function selectBuild(weapon) {
  const compatible=weapon.parts.filter(part=>part.itemId&&CORE_SLOTS.has(part.slot));
  const ranked=(items)=>[...items].sort((a,b)=>rawContribution(b,weapon.category)-rawContribution(a,weapon.category)||a.name.localeCompare(b.name));
  const suppressed=ranked(compatible.filter(part=>part.suppressed))[0]||null;
  const bestBySlot=new Map();for(const part of compatible){const slot=/optic|scope/i.test(part.slot)?'optic':part.slot.toLowerCase(),current=bestBySlot.get(slot);if(!current||ranked([part,current])[0]===part)bestBySlot.set(slot,part);}if(suppressed)bestBySlot.set('muzzle device',suppressed);
  const selected=new Map(),locked=new Set();
  const choose=(part,lock=false)=>{const slot=/optic|scope/i.test(part.slot)?'optic':part.slot.toLowerCase();if(locked.has(slot)&&!lock)return;selected.set(slot,part);if(lock)locked.add(slot);};
  const ordered=ranked([...bestBySlot.values()]).sort((a,b)=>(b.suppressed-a.suppressed)||((/optic|scope/i.test(b.slot)?1:0)-(/optic|scope/i.test(a.slot)?1:0)));
  for(const part of ordered){if(rawContribution(part,weapon.category)<=0&&!part.suppressed&&!/magazine|optic|scope/i.test(part.slot))continue;choose(part);if(part.dependencies.length){const alternatives=part.dependencies.map(dep=>compatible.find(candidate=>candidate.itemId===dep.itemId)).filter(Boolean);const dependency=ranked(alternatives)[0];if(dependency)choose(dependency,true);}}
  const result=[...selected.values()].sort((a,b)=>a.slot.localeCompare(b.slot)||a.name.localeCompare(b.name));
  const parts=result.map(part=>({...part,score:contribution(part,weapon.category)}));
  const score = balancePercentile(weapon, parts);
  return{parts,score,suppressed:parts.some(p=>p.suppressed),suppressionMessage:parts.some(p=>p.suppressed)?'Suppressed':'No compatible suppressor.'};
}
function contribution(part, category) { return Number(rawContribution(part, category).toFixed(4)); }
function balancePercentile(weapon, selectedParts) {
  const totals = selectedParts.reduce((acc, p) => {
    const ps = p.stats || {};
    acc.accuracy = (acc.accuracy || 0) + (ps.accuracy || 0);
    acc.stability = (acc.stability || 0) + (ps.stability || 0);
    acc.recoil = (acc.recoil || 0) + (ps.recoilWrist || 0) + (ps.recoilArm || 0);
    acc.damage = (acc.damage || 0) + (ps.damage || 0);
    acc.rof = (acc.rof || 0) + (ps.rof || 0);
    acc.magazine = (acc.magazine || 0) + (ps.magazine || 0);
    acc.adsSpeed = (acc.adsSpeed || 0) + (ps.adsSpeed || 0);
    acc.reloadSpeed = (acc.reloadSpeed || 0) + (ps.reloadSpeed || 0);
    return acc;
  }, {});

  const s = weapon.stats || {};
  if (s.accuracy != null) totals.accuracy = (totals.accuracy || 0) + s.accuracy;
  if (s.stability != null) totals.stability = (totals.stability || 0) + s.stability;
  if (s.recoil != null || (s.recoilWrist != null || s.recoilArm != null)) totals.recoil = (totals.recoil || 0) + (s.recoil || 0) + (s.recoilWrist || 0) + (s.recoilArm || 0);
  if (s.damage != null) totals.damage = (totals.damage || 0) + s.damage;
  if (s.rof != null) totals.rof = (totals.rof || 0) + s.rof;
  if (s.magazine != null) totals.magazine = (totals.magazine || 0) + s.magazine;
  if (s.adsSpeed != null) totals.adsSpeed = (totals.adsSpeed || 0) + s.adsSpeed;
  if (s.reloadSpeed != null) totals.reloadSpeed = (totals.reloadSpeed || 0) + s.reloadSpeed;

  const w = (CATEGORY_WEIGHTS[categoryGroup(weapon.category)] || CATEGORY_WEIGHTS.standard);
  let pctSum = 0;
  DIM_WEIGHT_KEYS.forEach(k => {
    const pct = _dimPercentile(totals[k], weapon.category, k);
    const effectivePct = REVERSED_DIMS.has(k) ? (1 - pct) : pct;
    pctSum += Math.abs(w[k]) * effectivePct;
  });
  return Number(Math.max(0, Math.min(100, pctSum)).toFixed(2));
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
