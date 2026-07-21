// workshop-recipes.js
// Workshop recipes sourced from the wiki (https://theforeverwinter.wiki.gg/wiki/Workshop),
// transcribed on 2026-07-18. Each component's internal RowName was resolved from
// the conversion table (Forever-Winter-ItemName-Conversion-Table-Categorized.csv)
// and confirmed against the 100% reference catalog (public/catalog.json) and the
// live save inventory, so the RowNames are real game items.
//
// Shape:
//   products: array of {
//     id,            // stable slug
//     wiki,          // wiki display name
//     tag,           // internal RowName of the PRODUCT (informational; not added)
//     perCraft,      // how many products one craft yields (wiki "Amount" column)
//     time,          // crafting time string (informational)
//     components: [ { tag, wiki, qty } ]  // qty = components consumed per craft
//   }

const WORKSHOP_RECIPES = {
  products: [
    {
      id: 'electric-motor', wiki: 'Electric Motor', tag: 'RareLoot_31_ElectricMotor',
      perCraft: 2, time: '10 minutes',
      components: [
        { tag: 'RareLoot_30_Relay', wiki: 'Relay', qty: 2 },
        { tag: 'RareLoot_33_Bolts', wiki: 'Bolts', qty: 2 },
        { tag: 'RareLoot_34_Nuts', wiki: 'Nuts', qty: 2 },
        { tag: 'RareLoot_74_MachineParts', wiki: 'Machine Parts', qty: 1 }
      ]
    },
    {
      id: '20mm-turret', wiki: '20mm Turret', tag: 'Turret_Debris_Loot',
      perCraft: 1, time: '15 minutes',
      components: [
        { tag: 'Turret_Debris_Loot', wiki: 'Turret Component', qty: 1 },
        { tag: 'RareLoot_99_CameraLens', wiki: 'Camera Lens', qty: 1 },
        { tag: 'RareLoot_31_ElectricMotor', wiki: 'Electric Motor', qty: 1 },
        { tag: 'RareLoot_133_PowerCell', wiki: 'Power Cell', qty: 1 }
      ]
    },
    {
      id: 'ied', wiki: 'IED', tag: 'BP_Loot_Explosives_C',
      perCraft: 1, time: '5 minutes',
      components: [
        { tag: 'BP_Loot_Explosives_C', wiki: 'Explosives', qty: 1 },
        { tag: 'RareLoot_27_Wires', wiki: 'Wires', qty: 1 },
        { tag: 'RareLoot_11_GPUCaps', wiki: 'Printed Circuit Board', qty: 1 }
      ]
    },
    {
      id: 'pneumatic-jump', wiki: 'Pneumatic Jump', tag: 'RareLoot_133_PowerCell',
      perCraft: 1, time: '15 minutes',
      components: [
        { tag: 'RareLoot_133_PowerCell', wiki: 'Power Cell', qty: 1 },
        { tag: 'recipe.ingredient.fixedweapons.02', wiki: 'Heavy Joint Assembly', qty: 1 },
        { tag: 'RareComputerBits', wiki: 'Military Circuitry', qty: 1 }
      ]
    },
    {
      id: 'standard-first-aid', wiki: 'Standard First Aid Kit', tag: 'FirstAid',
      perCraft: 2, time: '1 second',
      components: [
        { tag: 'RareLoot_89_Bandages', wiki: 'Bandages', qty: 2 },
        { tag: 'RareLoot_88_MiscMedication', wiki: 'Assorted Medicine', qty: 1 }
      ]
    },
    {
      id: 'water-canteen', wiki: 'Water Canteen', tag: 'ChocBar',
      perCraft: 2, time: '1 second',
      components: [
        { tag: 'RareLoot_83_BloodPacs', wiki: 'Blood Packs', qty: 1 }
      ]
    },
    {
      id: 'mre', wiki: 'MRE', tag: 'FoodTin',
      perCraft: 1, time: '1 second',
      components: [
        { tag: 'JunkFood01', wiki: 'Boinco Candy Bar', qty: 1 },
        { tag: 'FoodTin', wiki: 'Food Tin', qty: 1 },
        { tag: 'JunkFood03', wiki: 'Pretzels', qty: 1 }
      ]
    },
    {
      id: 'food-tin', wiki: 'Food Tin', tag: 'FoodTin',
      perCraft: 8, time: '1 second',
      components: [
        { tag: 'Plans08', wiki: 'Smuggled Organs', qty: 1 }
      ]
    },
    {
      id: 'rig-light', wiki: 'Rig Light', tag: 'RareLoot_64_LightBulb',
      perCraft: 1, time: '60 seconds',
      components: [
        { tag: 'RareLoot_136_CarBattery', wiki: 'Car Battery', qty: 1 },
        { tag: 'RareLoot_27_Wires', wiki: 'Wires', qty: 1 },
        { tag: 'RareLoot_64_LightBulb', wiki: 'Light Bulb', qty: 1 }
      ]
    },
    {
      id: 'military-codebreaker', wiki: 'Military Codebreaker', tag: 'RareLoot_9_CPU',
      perCraft: 1, time: '15 minutes',
      components: [
        { tag: 'PDA', wiki: 'Military PDA', qty: 1 },
        { tag: 'Plans06', wiki: 'Telemetry Unit', qty: 1 },
        { tag: 'Plans03', wiki: 'Military Hard Drive', qty: 1 },
        { tag: 'Plans02', wiki: 'Intelligence Disk', qty: 1 },
        { tag: 'RareLoot_19_MotherBoard', wiki: 'Motherboard', qty: 1 }
      ]
    },
    {
      id: 'railgun-turret-ammo', wiki: 'Rail Gun Turret Ammo Supply', tag: 'RareLoot_11_GPUCaps',
      perCraft: 1, time: '4 hours',
      components: [
        { tag: 'RareLoot_11_GPUCaps', wiki: 'Railgun Power Bank', qty: 2 },
        { tag: 'recipe.ingredient.fixedweapons.14', wiki: 'Railgun Cooling Component', qty: 1 },
        { tag: 'recipe.ingredient.fixedweapons.08', wiki: 'Railgun Assembly Component', qty: 1 }
      ]
    },
    {
      id: 'railgun-turret-weapon', wiki: 'Rail Gun Turret Weapon', tag: 'recipe.ingredient.fixedweapons.07',
      perCraft: 1, time: '5 hours',
      components: [
        { tag: 'recipe.ingredient.fixedweapons.07', wiki: 'High Durability Rail Component', qty: 1 },
        { tag: 'recipe.ingredient.fixedweapons.13', wiki: 'Railgun Breech Component', qty: 1 },
        { tag: 'recipe.ingredient.fixedweapons.10', wiki: 'Railgun Body Component', qty: 1 },
        { tag: 'recipe.ingredient.fixedweapons.05', wiki: 'Railgun Magazine', qty: 1 }
      ]
    },
    {
      id: 'at43-mass', wiki: 'AT-43 MASS', tag: 'HRF05_Manufacture_Crucible',
      perCraft: 1, time: '60 minutes',
      components: [
        { tag: 'HRF05_Manufacture_BreechAssembly', wiki: 'AT-43 Breech Assembly', qty: 1 },
        { tag: 'HRF05_Manufacture_Crucible', wiki: 'Crucible', qty: 1 },
        { tag: 'HRF05_Manufacture_FeedMechanism', wiki: 'AT-43 Feed Mechanism', qty: 1 },
        { tag: 'HRF05_Manufacture_GrindStone', wiki: 'Grindstone', qty: 5 },
        { tag: 'HRF05_Manufacture_MaintenanceTool', wiki: "Armorer's Wrench", qty: 1 },
        { tag: 'HRF05_Manufacture_MuzzleAssembly', wiki: 'AT-43 Muzzle Break', qty: 1 },
        { tag: 'HRF05_Manufacture_SpringSystem', wiki: 'AT-43 Spring System', qty: 1 },
        { tag: 'HRF05_Manufacture_TriggerAssembly', wiki: 'AT-43 Trigger Assembly', qty: 1 },
        { tag: 'RareLoot_72_WeaponLubricant', wiki: 'Military Grade Lubricant', qty: 1 },
        { tag: 'RareLoot_117_WeaponParts', wiki: 'Weapon Parts', qty: 1 }
      ]
    },
    {
      id: 'advanced-first-aid', wiki: 'Advanced First Aid Kit', tag: 'RareLoot_85_AdvancedMedicalTools',
      perCraft: 2, time: '1 second',
      components: [
        { tag: 'RareLoot_84_MedicalTools', wiki: 'Medical Tools', qty: 2 },
        { tag: 'RareLoot_83_BloodPacs', wiki: 'Blood Packs', qty: 1 }
      ]
    },
    {
      id: 'small-first-aid', wiki: 'Small First Aid Kit', tag: 'RareLoot_81_Syringe',
      perCraft: 2, time: '1 second',
      components: [
        { tag: 'RareLoot_81_Syringe', wiki: 'Syringe', qty: 2 },
        { tag: 'JunkFood05', wiki: '"Beef" Flavor Packet', qty: 1 }
      ]
    },
    {
      id: 'fertilizer', wiki: 'Fertilizer', tag: 'Poo01',
      perCraft: 3, time: '15 minutes',
      components: [
        { tag: 'RareLoot_112_Alkaline', wiki: 'Urea', qty: 1 },
        { tag: 'FoodTin', wiki: 'Food Tin', qty: 1 }
      ]
    },
    {
      id: 'power-cell', wiki: 'Power Cell', tag: 'RareLoot_133_PowerCell',
      perCraft: 1, time: '5 minutes',
      components: [
        { tag: 'RareLoot_135_RechargeableBattery', wiki: 'Rechargeable Battery', qty: 1 },
        { tag: 'RareLoot_138_RechargeableBatteryCharger', wiki: 'Battery Charger', qty: 1 },
        { tag: 'RareLoot_74_MachineParts', wiki: 'Machine Parts', qty: 1 }
      ]
    },
    {
      id: 'iff-eurasia-2', wiki: 'Eurasian IFF Chip LVL2', tag: 'IFF_Eurasia_02',
      perCraft: 1, time: '5 minutes',
      components: [
        { tag: 'IFF_Eurasia_01', wiki: 'Eurasian IFF Chip LVL1', qty: 5 }
      ]
    },
    {
      id: 'iff-eurasia-3', wiki: 'Eurasian IFF Chip LVL3', tag: 'IFF_Eurasia_03',
      perCraft: 1, time: '15 minutes',
      components: [
        { tag: 'IFF_Eurasia_02', wiki: 'Eurasian IFF Chip LVL2', qty: 3 }
      ]
    },
    {
      id: 'iff-europa-2', wiki: 'Europan IFF Chip LVL2', tag: 'IFF_Europa_02',
      perCraft: 1, time: '5 minutes',
      components: [
        { tag: 'IFF_Europa_01', wiki: 'Europan IFF Chip LVL1', qty: 5 }
      ]
    },
    {
      id: 'iff-europa-3', wiki: 'Europan IFF Chip LVL3', tag: 'IFF_Europa_03',
      perCraft: 1, time: '15 minutes',
      components: [
        { tag: 'IFF_Europa_02', wiki: 'Europan IFF Chip LVL2', qty: 3 }
      ]
    },
    {
      id: 'iff-euruskan-2', wiki: 'Euruskan IFF Chip LVL2', tag: 'IFF_Euruskan_02',
      perCraft: 1, time: '5 minutes',
      components: [
        { tag: 'IFF_Euruskan_01', wiki: 'Euruskan IFF Chip LVL1', qty: 5 }
      ]
    },
    {
      id: 'iff-euruskan-3', wiki: 'Euruskan IFF Chip LVL3', tag: 'IFF_Euruskan_03',
      perCraft: 1, time: '15 minutes',
      components: [
        { tag: 'IFF_Euruskan_02', wiki: 'Euruskan IFF Chip LVL2', qty: 3 }
      ]
    },
    {
      id: 'cpu', wiki: 'CPU', tag: 'RareLoot_9_CPU',
      perCraft: 1, time: '10 minutes',
      components: [
        { tag: 'RareLoot_36_ScrewDriver', wiki: 'Screwdriver', qty: 1 },
        { tag: 'RareLoot_13_SSD', wiki: 'Modem', qty: 1 }
      ]
    },
    {
      id: 'advanced-nav-device', wiki: 'Advanced Navigation Device', tag: 'RareLoot_20_MilitaryComputer',
      perCraft: 1, time: '10 minutes',
      components: [
        { tag: 'RareLoot_16_GPC', wiki: 'Organoid Memory Board', qty: 1 },
        { tag: 'RareLoot_13_SSD', wiki: 'Modem', qty: 1 },
        { tag: 'RareLoot_17_ComputerFan', wiki: 'Computer Fan', qty: 1 }
      ]
    },
    {
      id: 'heavy-trauma-kit', wiki: 'Heavy-Duty Trauma Kit', tag: 'RareLoot_85_AdvancedMedicalTools',
      perCraft: 1, time: '10 minutes',
      components: [
        { tag: 'RareLoot_88_MiscMedication', wiki: 'Assorted Medicine', qty: 1 },
        { tag: 'RareLoot_80_MedicalAlchohol', wiki: 'Medical Alcohol', qty: 1 },
        { tag: 'RareLoot_84_MedicalTools', wiki: 'Medical Tools', qty: 1 },
        { tag: 'RareLoot_89_Bandages', wiki: 'Bandages', qty: 1 },
        { tag: 'RareLoot_90_Tourniquets', wiki: 'Tourniquet', qty: 1 }
      ]
    },
    {
      id: 'construction-drone', wiki: 'Construction Drone', tag: 'RareLoot_9_CPU',
      perCraft: 1, time: '30 minutes',
      components: [
        { tag: 'RareLoot_9_CPU', wiki: 'CPU', qty: 1 },
        { tag: 'Tools10', wiki: 'Precision Tool Set', qty: 1 },
        { tag: 'RareLoot_31_ElectricMotor', wiki: 'Electric Motor', qty: 1 },
        { tag: 'RareLoot_132_MCCMilitaryComputerPowerCell', wiki: 'Military Power Cell', qty: 1 }
      ]
    },
    {
      id: 'fast-travel-drone', wiki: 'Fast Travel Drone', tag: 'RareLoot_128_sheetmetal',
      perCraft: 2, time: '15 minutes',
      components: [
        { tag: 'RareLoot_128_sheetmetal', wiki: 'Sheet Metal', qty: 2 },
        { tag: 'RareLoot_31_ElectricMotor', wiki: 'Electric Motor', qty: 2 },
        { tag: 'RareLoot_24_LCD', wiki: 'LCD', qty: 2 },
        { tag: 'RareLoot_133_PowerCell', wiki: 'Power Cell', qty: 2 }
      ]
    },
    {
      id: 'recovery-drone', wiki: 'Recovery Drone', tag: 'RareLoot_99_CameraLens',
      perCraft: 1, time: '60 minutes',
      components: [
        { tag: 'RareLoot_99_CameraLens', wiki: 'Camera Lens', qty: 1 },
        { tag: 'RareLoot_121_ArmorRepairKit', wiki: 'Repair Dronelet', qty: 1 },
        { tag: 'RareLoot_31_ElectricMotor', wiki: 'Electric Motor', qty: 1 },
        { tag: 'RareLoot_139_MilitaryBattery', wiki: 'Military Battery', qty: 1 }
      ]
    },
    {
      id: 'adrenaline-stim', wiki: 'Adrenaline Stim', tag: 'RareLoot_81_Syringe',
      perCraft: 2, time: '1 second',
      components: [
        { tag: 'RareLoot_81_Syringe', wiki: 'Syringe', qty: 2 },
        { tag: 'JunkFood04', wiki: 'Energy Bar', qty: 1 }
      ]
    },
    {
      id: 'exo-stamina', wiki: 'Exo Stamina Equipment', tag: 'Quest_AdvancedJoint',
      perCraft: 1, time: '30 minutes',
      components: [
        { tag: 'Quest_ExoHardDrive', wiki: 'Exo Component', qty: 1 },
        { tag: 'Quest_AdvancedJoint', wiki: 'Advanced Joint', qty: 1 },
        { tag: 'Tools11', wiki: 'Heavy-Duty Battery', qty: 1 },
        { tag: 'RareLoot_28_MilitaryCables', wiki: 'Military Cables', qty: 1 }
      ]
    },
    {
      id: 'tactical-camera', wiki: 'Tactical Camera', tag: 'EM_LootObject_01',
      perCraft: 1, time: '15 minutes',
      components: [
        { tag: 'EM_LootObject_01', wiki: 'Laser Rangefinder', qty: 1 },
        { tag: 'Cyborg_Loot_Eurasia', wiki: "Cyborg's Head", qty: 1 },
        { tag: 'RareLoot_28_MilitaryCables', wiki: 'Military Cables', qty: 1 }
      ]
    },
    {
      id: 'gunpowder', wiki: 'Gunpowder', tag: 'GunPoweder',
      perCraft: 3, time: '15 minutes',
      components: [
        { tag: 'BP_Loot_Explosives_C', wiki: 'Explosives', qty: 1 },
        { tag: 'RareLoot_44_BasicPliers', wiki: 'Basic Pliers', qty: 1 }
      ]
    },
    {
      id: 'organoid-networking', wiki: 'Organoid Networking Board', tag: 'RareLoot_97_AdvancedNetworkboard',
      perCraft: 1, time: '10 minutes',
      components: [
        { tag: 'Quest_Neuro_Uplink', wiki: 'Neuro Uplink Board', qty: 1 },
        { tag: 'RareLoot_16_GPC', wiki: 'Organoid Memory Board', qty: 1 },
        { tag: 'RareLoot_19_MotherBoard', wiki: 'Motherboard', qty: 1 },
        { tag: 'RareLoot_132_MCCMilitaryComputerPowerCell', wiki: 'Military Power Cell', qty: 1 }
      ]
    },
    {
      id: 'sentient-drill', wiki: 'Sentient Drill', tag: 'RareLoot_47_SentientDrill',
      perCraft: 1, time: '10 minutes',
      components: [
        { tag: 'RareLoot_29_OutletPort', wiki: 'Organoid Outlet', qty: 1 },
        { tag: 'RareLoot_78_Plugcord', wiki: 'Organoid Plug', qty: 1 },
        { tag: 'RareLoot_26_AdvancedProcessor', wiki: 'Wetware Processor', qty: 1 }
      ]
    },
    {
      id: 'processor-board', wiki: 'Processor Board', tag: 'RareLoot_18_Processorboard',
      perCraft: 1, time: '5 minutes',
      components: [
        { tag: 'RareLoot_36_ScrewDriver', wiki: 'Screwdriver', qty: 1 },
        { tag: 'PDA', wiki: 'Military PDA', qty: 1 }
      ]
    },
    {
      id: 'turret-base', wiki: 'Turret Base', tag: 'recipe.ingredient.fixedweapons.02',
      perCraft: 1, time: '3 hours',
      components: [
        { tag: 'recipe.ingredient.fixedweapons.02', wiki: 'Heavy Joint Assembly', qty: 4 }
      ]
    }
  ]
};

// Convenience: lookup by id.
function getWorkshopProduct(id) {
  return WORKSHOP_RECIPES.products.find(p => p.id === id) || null;
}
