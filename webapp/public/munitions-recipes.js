// munitions-recipes.js
// Munitions Printer recipes sourced from the wiki
// (https://theforeverwinter.wiki.gg/wiki/Munitions_Printer), transcribed
// 2026-07-18. Each component's internal RowName was resolved from the
// conversion table (Forever-Winter-ItemName-Conversion-Table-Categorized.csv)
// and confirmed against the 100% reference catalog (public/catalog.json) and
// the live save inventory, so the RowNames are real game items.
//
// Two recipes list another CRAFTED PRODUCT as an ingredient (.50 PST Ammo needs
// .50 BMG; Cluster Grenade needs Frag Grenade). Those product refs are expanded
// to their base components via PRODUCT_COMPONENTS so the planner adds real
// materials, not crafted items.
//
// Shape (mirrors workshop-recipes.js):
//   products: array of { id, wiki, tag, perCraft, time, components:[{tag,wiki,qty}] }

const MUNITIONS_RECIPES = {
  products: [
    {
      id: 'ammo-127x55', wiki: '12.7x55mm Subsonic Ammo', tag: 'Item.Ammo.127',
      perCraft: 30, time: '1 second',
      components: [
        { tag: 'RareMetals', wiki: 'Rare Metals', qty: 1 },
        { tag: 'GunPoweder', wiki: 'Gunpowder', qty: 2 }
      ]
    },
    {
      id: 'ammo-12g-buckshot', wiki: '12-Gauge Buckshot', tag: 'Item.Ammo.12g',
      perCraft: 30, time: '1 second',
      components: [
        { tag: 'BallBearings', wiki: 'Ball Bearings', qty: 2 },
        { tag: 'Poo01', wiki: 'Fertilizer', qty: 1 }
      ]
    },
    {
      id: 'ammo-20x105', wiki: '20x105mm Anti-Tank', tag: 'Item.Ammo.20mm',
      perCraft: 10, time: '15 minutes',
      components: [
        { tag: 'RareMetals', wiki: 'Rare Metals', qty: 2 },
        { tag: 'BP_Loot_Explosives_C', wiki: 'Explosives', qty: 1 }
      ]
    },
    {
      id: 'ammo-308', wiki: '.308 Ammo', tag: 'Item.Ammo.308',
      perCraft: 90, time: '1 second',
      components: [
        { tag: 'RareLoot_35_Nails', wiki: 'Nails', qty: 2 },
        { tag: 'GunPoweder', wiki: 'Gunpowder', qty: 1 }
      ]
    },
    {
      id: 'ammo-357', wiki: '.357 Magnum Ammo', tag: 'Item.Ammo.357',
      perCraft: 60, time: '1 second',
      components: [
        { tag: 'RareLoot_35_Nails', wiki: 'Nails', qty: 2 },
        { tag: 'GunPoweder', wiki: 'Gunpowder', qty: 1 }
      ]
    },
    {
      id: 'ammo-40mm', wiki: '40mm Grenade', tag: 'Item.Ammo.40mm',
      perCraft: 6, time: '15 minutes',
      components: [
        { tag: 'RareLoot_106_PlasticExplosive', wiki: 'Explosive Charge', qty: 1 },
        { tag: 'RareLoot_101_Thermite', wiki: 'Thermite', qty: 1 }
      ]
    },
    {
      id: 'ammo-50bmg', wiki: '.50 BMG', tag: 'Item.Ammo.50cal',
      perCraft: 30, time: '1 second',
      components: [
        { tag: 'RareMetals', wiki: 'Rare Metals', qty: 2 },
        { tag: 'GunPoweder', wiki: 'Gunpowder', qty: 2 }
      ]
    },
    {
      id: 'ammo-762x39', wiki: '7.62x39mm Ammo', tag: 'Item.Ammo.762',
      perCraft: 90, time: '1 second',
      components: [
        { tag: 'RareLoot_35_Nails', wiki: 'Nails', qty: 2 },
        { tag: 'GunPoweder', wiki: 'Gunpowder', qty: 2 }
      ]
    },
    {
      id: 'ammo-762x54r', wiki: '7.62x54mmR Ammo', tag: 'Item.Ammo.54R',
      perCraft: 30, time: '1 second',
      components: [
        { tag: 'RareMetals', wiki: 'Rare Metals', qty: 1 },
        { tag: 'GunPoweder', wiki: 'Gunpowder', qty: 2 }
      ]
    },
    {
      id: 'ammo-545x39-cryo-whiskey', wiki: '5.45x39mm Cryo Ammo (Whiskey)', tag: 'Item.Ammo.545.Cryo',
      perCraft: 30, time: '1 second',
      components: [
        { tag: 'Alcohol02', wiki: 'Whiskey', qty: 1 },
        { tag: 'Item.Ammo.545', wiki: '5.45x39mm Ammo', qty: 30 }
      ]
    },
    {
      id: 'ammo-545x39-cryo-cigarettes', wiki: '5.45x39mm Cryo Ammo (Cigarettes)', tag: 'Item.Ammo.545.Cryo',
      perCraft: 30, time: '1 second',
      components: [
        { tag: 'Tobacco01', wiki: 'Dogboro Cigarettes', qty: 3 },
        { tag: 'Item.Ammo.545', wiki: '5.45x39mm Ammo', qty: 30 }
      ]
    },
    {
      id: 'ammo-545x39', wiki: '5.45x39mm Ammo', tag: 'Item.Ammo.545',
      perCraft: 90, time: '1 second',
      components: [
        { tag: 'MetalFragments', wiki: 'Metal Fragments', qty: 2 },
        { tag: 'GunPoweder', wiki: 'Gunpowder', qty: 1 }
      ]
    },
    {
      id: 'ammo-556x45', wiki: '5.56x45mm Ammo', tag: 'Item.Ammo.556',
      perCraft: 90, time: '1 second',
      components: [
        { tag: 'MetalFragments', wiki: 'Metal Fragments', qty: 2 },
        { tag: 'GunPoweder', wiki: 'Gunpowder', qty: 1 }
      ]
    },
    {
      id: 'ammo-57x28', wiki: '5.7x28mm Ammo', tag: 'Item.Ammo.57x28',
      perCraft: 90, time: '1 second',
      components: [
        { tag: 'MetalFragments', wiki: 'Metal Fragments', qty: 2 },
        { tag: 'GunPoweder', wiki: 'Gunpowder', qty: 1 }
      ]
    },
    {
      id: 'ammo-9x19', wiki: '9x19mm Ammo', tag: 'Item.Ammo.919',
      perCraft: 120, time: '1 second',
      components: [
        { tag: 'MetalFragments', wiki: 'Metal Fragments', qty: 2 },
        { tag: 'Poo01', wiki: 'Fertilizer', qty: 1 }
      ]
    },
    {
      id: 'ammo-45acp', wiki: '.45 ACP Ammo', tag: 'Item.Ammo.45ACP',
      perCraft: 90, time: '1 second',
      components: [
        { tag: 'MetalFragments', wiki: 'Metal Fragments', qty: 2 },
        { tag: 'GunPoweder', wiki: 'Gunpowder', qty: 1 }
      ]
    },
    {
      id: 'item-extraction-beacon', wiki: 'Item Extraction Beacon', tag: 'Drone_Beacon_BossPartRetreive',
      perCraft: 1, time: '1 second',
      components: [
        { tag: 'RareLoot_20_MilitaryComputer', wiki: 'Advanced Navigation Device', qty: 2 },
        { tag: 'Drone_Recovery', wiki: 'Recovery Drone', qty: 1 },
        { tag: 'RareLoot_132_MCCMilitaryComputerPowerCell', wiki: 'Military Power Cell', qty: 1 }
      ]
    },
    {
      id: 'special-units-detpack', wiki: 'Special Units DetPack', tag: 'Item_Explosive_BossKiller',
      perCraft: 1, time: '1 second',
      components: [
        { tag: 'RareLoot_106_PlasticExplosive', wiki: 'Explosive Charge', qty: 2 },
        { tag: 'RareLoot_101_Thermite', wiki: 'Thermite', qty: 2 },
        { tag: 'RareComputerBits', wiki: 'Military Circuitry', qty: 1 }
      ]
    },
    {
      id: 'frag-grenade', wiki: 'Frag Grenade', tag: 'Item.Ammo.FragGrenade',
      perCraft: 3, time: '1 second',
      components: [
        { tag: 'BP_Loot_Explosives_C', wiki: 'Explosives', qty: 1 },
        { tag: 'CompCanister', wiki: 'Old Paint Can', qty: 3 },
        { tag: 'Fuse', wiki: 'Fuse', qty: 3 }
      ]
    },
    {
      id: 'signal-scrambler-grenade', wiki: 'Signal Scrambler Grenade', tag: 'Item.Ammo.FactionGrenade',
      perCraft: 3, time: '1 second',
      components: [
        { tag: 'MetalPipe', wiki: 'Metal Pipe', qty: 1 },
        { tag: 'TransTower_Quest_Marker', wiki: 'Frequency Tap', qty: 1 },
        { tag: 'CompCanister', wiki: 'Old Paint Can', qty: 3 },
        { tag: 'Fuse', wiki: 'Fuse', qty: 3 }
      ]
    },
    {
      id: 'cluster-grenade', wiki: 'Cluster Grenade', tag: 'Item.Ammo.ClusterGrenade',
      perCraft: 1, time: '1 second',
      // Expanded: 3x Frag Grenade + 1x Military Tape. Frag Grenade itself expands
      // to (1 Explosives + 3 Old Paint Can + 3 Fuse) per craft.
      components: [
        { tag: 'Item.Ammo.FragGrenade', wiki: 'Frag Grenade', qty: 3, expand: true },
        { tag: 'RareLoot_5_MilitaryTape', wiki: 'Military Tape', qty: 1 }
      ]
    },
    {
      id: 'decoy-grenade', wiki: 'Decoy Grenade', tag: 'Item.Ammo.DecoyGrenade',
      perCraft: 3, time: '1 second',
      components: [
        { tag: 'RareLoot_21_DVDplayer', wiki: 'Neuralink Disc Player', qty: 1 },
        { tag: 'CompCanister', wiki: 'Old Paint Can', qty: 3 },
        { tag: 'Fuse', wiki: 'Fuse', qty: 3 }
      ]
    },
    {
      id: 'ammo-50pst', wiki: '.50 PST Ammo', tag: 'Item.Ammo.50PST',
      perCraft: 8, time: '1 second',
      // Expanded: 8x .50 BMG + 4x Thermite + 1x Diodegradable Multi-tool.
      // .50 BMG itself expands to (2 Rare Metals + 2 Gunpowder) per craft.
      components: [
        { tag: 'Item.Ammo.50cal', wiki: '.50 BMG', qty: 8, expand: true },
        { tag: 'RareLoot_101_Thermite', wiki: 'Thermite', qty: 4 },
        { tag: 'RareLoot_51_Multitool', wiki: 'Diodegradable Multi-tool', qty: 1 }
      ]
    }
  ],

  // Expansion table: product RowName -> base components (used when a recipe
  // lists a crafted product as an ingredient). Quantities here are PER that
  // product, multiplied by the recipe's qty for it.
  expansions: {
    'Item.Ammo.FragGrenade': [
      { tag: 'BP_Loot_Explosives_C', wiki: 'Explosives', qty: 1 },
      { tag: 'CompCanister', wiki: 'Old Paint Can', qty: 3 },
      { tag: 'Fuse', wiki: 'Fuse', qty: 3 }
    ],
    'Item.Ammo.50cal': [
      { tag: 'RareMetals', wiki: 'Rare Metals', qty: 2 },
      { tag: 'GunPoweder', wiki: 'Gunpowder', qty: 2 }
    ]
  }
};

function getMunitionsProduct(id) {
  return MUNITIONS_RECIPES.products.find(p => p.id === id) || null;
}
