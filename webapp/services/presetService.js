'use strict';
const fs=require('node:fs');const path=require('node:path');
const itemData=require('../data/items.canonical.json').items;
const rigData=require('../data/rigs.json').rigs;
const weaponData=require('../data/weapon-builds.canonical.json').weapons;
const {selectBuild}=require('./weaponBuildService');

const slotLabels={MAG:'Magazine',GAS:'Gas tube',ATTMD:'Muzzle device',PICSCP:'Scope',PICOPT:'Optic',PICFGR:'Foregrip',PICFRS:'Front sight',PICRES:'Rear sight',BRL:'Barrel',HGD:'Handguard',PGR:'Grip',STK:'Stock',UPP:'Upper assembly',TRG:'Trigger'};
const friendly=id=>itemData[id]?.displayName||id;
function slotLabel(value){const code=String(value||'').split('::').pop();return slotLabels[code]||code||'Attachment';}
function parsePresetData(customJson,loadoutJson,exrNames=new Set()){
  const props=customJson?.root?.properties||{},loadout=loadoutJson?.root?.properties||{};
  const active=new Set([loadout.PrimaryFileName_0,loadout.PrimaryNickname_0,loadout.SecondaryFileName_0].filter(Boolean));
  const weapons=(props.FWCustomSavedWeapon_0||[]).map(entry=>{
    const value=entry.value||{},weaponId=value.WeaponUsed_0?.RowName_0||null,weapon=weaponData.find(row=>row.id===weaponId),build=weapon?selectBuild(weapon):null;
    const attachments=(value.ChangedWeaponParts_0||[]).map(part=>{const detail=part.value||{},itemId=detail.ItemRowName_0||null;return{slot:slotLabel(detail.AttachmentCategory_0||part.key),itemId,name:friendly(itemId),defaultIndex:detail.DefaultIndex_0,attachmentExtra:detail.AttachmentExtra_0,alternativeSocket:detail.UseAlternativeSocket_0===true,placeholder:itemId===detail.AttachmentCategory_0};});
    const savedIds=new Set(attachments.filter(part=>!part.placeholder).map(part=>part.itemId)),bis=build?.parts||[],bisIds=new Set(bis.map(part=>part.itemId));
    return{name:entry.key,filename:value.Filename_0||entry.key,saveIndex:value.SaveIndex_0,weaponId,weaponName:weapon?.name||friendly(weaponId),category:weapon?.category||'Unknown',attachments,active:active.has(entry.key)||active.has(value.Filename_0),hasPreview:exrNames.has(value.Filename_0||entry.key),bisSupported:!!build?.parts.length,bisScore:build?.score??null,bisMatches:[...savedIds].filter(id=>bisIds.has(id)).length,bisMissing:bis.filter(part=>!savedIds.has(part.itemId)).map(part=>({itemId:part.itemId,name:part.name,slot:part.slot})),savedOverrides:attachments.filter(part=>!part.placeholder).length};
  }).sort((a,b)=>Number(b.active)-Number(a.active)||a.name.localeCompare(b.name));
  const rigs=(props['FWCustom Saved Rig_0']||[]).map(entry=>{const value=entry.value||{},rigId=value.RigUsed_0?.RowName_0||null,rig=rigData.find(row=>row.id===rigId);return{name:entry.key,filename:value.Filename_0||entry.key,saveIndex:value.SaveIndex_0,rigId,rigName:rig?.name||rigId,hasPreview:exrNames.has(value.Filename_0||entry.key),containers:(value.ChangedContainers_0||[]).map(row=>({slot:row.key,itemId:row.value,name:friendly(row.value)})),frames:(value.ChangedDanglyFrames_0||[]).map(row=>({slot:row.key,itemId:row.value,name:friendly(row.value)}))};}).sort((a,b)=>a.name.localeCompare(b.name));
  return{weapons,rigs,summary:{weaponPresets:weapons.length,rigPresets:rigs.length,activeWeaponPreset:weapons.find(row=>row.active)?.name||null,previewsMatched:weapons.filter(row=>row.hasPreview).length+rigs.filter(row=>row.hasPreview).length}};
}
async function listPresets(key){const gvas=require('./gvasService');const [custom,loadout]=await Promise.all([gvas.readNamedBlobJson(key,'PlayerCustomRigs'),gvas.readNamedBlobJson(key,'PlayerLoadout')]);const savedDir=path.join(process.env.LOCALAPPDATA||'', 'ForeverWinter','Saved');let exrNames=new Set();try{exrNames=new Set(fs.readdirSync(savedDir).filter(name=>/\.exr$/i.test(name)).map(name=>path.basename(name,path.extname(name))));}catch{}return parsePresetData(custom,loadout,exrNames);}
module.exports={listPresets,parsePresetData,slotLabel};
