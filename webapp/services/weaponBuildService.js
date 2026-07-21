'use strict';
const data = require('../data/weapon-builds.canonical.json');
const audit = require('../data/weapon-build-audit.json');

const CORE_SLOTS = new Set(['Barrel','Gas Tube','Grip','Handguard','Magazine','Stock','Upper Assembly','Upper assembly','Receiver','Trigger','Muzzle Device','Optic','Scope','Foregrip']);
const precision = category => /heavy|precision|sniper/i.test(category);
const close = category => /pistol|submachine|shotgun/i.test(category);
function contribution(part, category) {
  const s = part.stats;
  let score = s.accuracy*30 + s.stability*24 - s.recoilWrist*18 - s.recoilArm*18 - s.stabilizationSpeed*8 - s.stabilizationLength*8 + s.damage*12 + s.rof*8 + s.adsSpeed*7 + s.reloadSpeed*5 + s.magazine*.35;
  if (/optic|scope/i.test(part.slot)) {
    const target = close(category) ? 70 : precision(category) ? 30 : 50;
    score += 25 - Math.min(25, Math.abs(s.fov - target) * .5);
  }
  return Number(score.toFixed(4));
}
function selectBuild(weapon) {
  const compatible=weapon.parts.filter(part=>part.itemId&&CORE_SLOTS.has(part.slot));
  const ranked=(items)=>[...items].sort((a,b)=>contribution(b,weapon.category)-contribution(a,weapon.category)||a.name.localeCompare(b.name));
  const suppressed=ranked(compatible.filter(part=>part.suppressed))[0]||null;
  const bestBySlot=new Map();for(const part of compatible){const slot=/optic|scope/i.test(part.slot)?'optic':part.slot.toLowerCase(),current=bestBySlot.get(slot);if(!current||ranked([part,current])[0]===part)bestBySlot.set(slot,part);}if(suppressed)bestBySlot.set('muzzle device',suppressed);
  const selected=new Map(),locked=new Set();
  const choose=(part,lock=false)=>{const slot=/optic|scope/i.test(part.slot)?'optic':part.slot.toLowerCase();if(locked.has(slot)&&!lock)return;selected.set(slot,part);if(lock)locked.add(slot);};
  const ordered=ranked([...bestBySlot.values()]).sort((a,b)=>(b.suppressed-a.suppressed)||((/optic|scope/i.test(b.slot)?1:0)-(/optic|scope/i.test(a.slot)?1:0)));
  for(const part of ordered){if(contribution(part,weapon.category)<=0&&!part.suppressed&&!/magazine|optic|scope/i.test(part.slot))continue;choose(part);if(part.dependencies.length){const alternatives=part.dependencies.map(dep=>compatible.find(candidate=>candidate.itemId===dep.itemId)).filter(Boolean);const dependency=ranked(alternatives)[0];if(dependency)choose(dependency,true);}}
  const result=[...selected.values()].sort((a,b)=>a.slot.localeCompare(b.slot)||a.name.localeCompare(b.name)).map(part=>({...part,score:contribution(part,weapon.category)}));
  return{parts:result,score:Number(result.reduce((sum,p)=>sum+p.score,0).toFixed(2)),suppressed:result.some(p=>p.suppressed),suppressionMessage:result.some(p=>p.suppressed)?'Suppressed':'No compatible suppressor.'};
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
    return {...weapon,parts:undefined,build:{...build,parts,owned:parts.filter(p=>!p.missing).length,missing:parts.filter(p=>p.missing).length},currentXp};
  })};
}
async function addMissing(key,id) {
  const weapon=getWeapon(id), build=selectBuild(weapon);
  if (!build.parts.length) throw Object.assign(new Error('No trusted compatible build is available'),{status:422});
  return require('./gvasService').ensureInventoryItems(key,build.parts.map(part=>({itemId:part.itemId,sourceMap:part.inventoryMap||'Items'})));
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
module.exports={ contribution,selectBuild,getWeapon,getBuildPart,listBuilds,addMissing,addBuildPart,addMissingForOwnedWeapons };
