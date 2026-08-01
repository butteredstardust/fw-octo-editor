// vault.js
// The Vault (home stash) -- a separate GVAS blob (BinaryData.Name =
// 'VaultInventory') from TempInventory, so items and currency stored here
// never show up in listInventoryItems()/getCurrencies().

const { readNamedBlobJson } = require('./codec');

// VaultItems_0 keys are gameplay tags ("Inventory.Weapon.PST06" /
// "Inventory.Item.X"), unlike TempInventory's bare RowNames ("PST06") --
// stripped here so the frontend can resolve names through the same
// catalog/weapon lookups it already uses.
async function getVaultInventory(key) {
  const json = await readNamedBlobJson(key, 'VaultInventory');
  const props = (json && json.root && json.root.properties) || {};
  const items = (props.VaultItems_0 || []).map(entry => {
    const tag = entry.key && entry.key.TagName_0;
    const name = String(tag || '').replace(/^Inventory\.(Weapon|Item)\./, '');
    return { name, tag, quantity: entry.value };
  });
  const currencyEntry = props.VaultCurrency_0 || {};
  const currencyRow = currencyEntry.CurrencyRow_0 || {};
  const currency = {
    rowName: currencyRow.RowName_0 || null,
    amount: currencyEntry.CurrencyAmount_0 != null ? currencyEntry.CurrencyAmount_0 : 0
  };
  return { items, currency };
}

module.exports = { getVaultInventory };
