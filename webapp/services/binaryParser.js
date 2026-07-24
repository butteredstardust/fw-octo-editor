'use strict';

// Structured (non-heuristic) fallback parser for the TempInventory GVAS blob,
// used only when uesave.exe is unavailable or fails its mandatory byte
// round-trip check (see gvasService.listInventoryItems()). The previous
// implementation scanned for bare identifier-looking tokens and paired each
// with a nearby "Quantity"/"IntProperty" marker within an arbitrary byte
// window, filtered through a ~200-entry hand-maintained keyword blacklist to
// avoid false positives -- against the real save, that approach missed 27
// genuine entries (mostly dotted names like "Item.Ammo.545.Junk" the token
// regex couldn't match) and fabricated 50 bogus ones (structural tokens from
// unrelated maps like Containers_0 that happen to sit near an unrelated
// Quantity field), and only recognized Items_0 (base/damaged weapons were
// silently dropped).
//
// This instead walks the *known, verified* property shape of each inventory
// entry directly. Every entry in Items_0/Weapons_0/Danglies_0 has the shape:
//
//   <key: RowName as an FName> {
//     ItemRowHandle_0 | WeaponRowHandle_0 | DanglyRowHandle_0 : StructProperty {
//       DataTableRowHandle : StructProperty { DataTable: ObjectProperty, RowName: NameProperty }
//     },
//     Quantity_0 : IntProperty
//   }
//
// Rather than parse the enclosing StructProperty/MapProperty container tags
// (which carry a materially more complex struct-name+guid header this fallback
// doesn't need), this anchors on the ItemRowHandle/WeaponRowHandle/
// DanglyRowHandle field name -- a 100%-reliable, unambiguous text marker --
// then reads the nearby RowName and Quantity fields with a small, strictly
// validated reader for exactly the two scalar UE property types involved
// (NameProperty, IntProperty). Verified byte-for-byte against a real save:
// cross-checked entry-by-entry against uesave's own JSON output across all
// three maps, 519/519 entries matched exactly (see
// test/gvasService.binaryParser.test.js and the C6 e2e test).
//
// Every UE scalar property (inside a struct) is serialized as:
//   Name (FString), Type (FString), ArrayIndex (int32, 0 here),
//   Size (int32, byte-length of Value), HasPropertyGuid (u8, 0 here), Value
// -- confirmed independently for both NameProperty (Size == the value
// FString's own byte length) and IntProperty (Size == 4).

class Cursor {
  constructor(buf, offset) { this.buf = buf; this.offset = offset; }
  i32() { const v = this.buf.readInt32LE(this.offset); this.offset += 4; return v; }
  u8() { const v = this.buf.readUInt8(this.offset); this.offset += 1; return v; }
  // UE FString: int32 length. Positive = ASCII including a null terminator; 0 = empty string.
  fstring() {
    const len = this.i32();
    if (len === 0) return '';
    if (len < 0 || len > 4096) throw new Error(`implausible FString length ${len} at offset ${this.offset - 4}`);
    const str = this.buf.toString('latin1', this.offset, this.offset + len - 1);
    this.offset += len;
    return str;
  }
}

// Reads a scalar property's Type/ArrayIndex/Size/HasGuid/Value, given the
// byte offset and length of its already-located Name text (e.g. "RowName").
// Throws on any deviation from the verified shape rather than guessing --
// this fallback only ever returns entries it's fully confident about.
function readScalarField(buf, nameOffset, nameLength) {
  const c = new Cursor(buf, nameOffset + nameLength + 1); // skip name text + null terminator
  const type = c.fstring();
  const arrayIndex = c.i32();
  const size = c.i32();
  const hasGuid = c.u8();
  if (arrayIndex !== 0) throw new Error(`unexpected non-zero ArrayIndex at offset ${c.offset - 9}`);
  if (hasGuid !== 0) throw new Error(`unexpected non-zero HasPropertyGuid at offset ${c.offset - 1}`);
  let value;
  if (type === 'IntProperty') {
    if (size !== 4) throw new Error(`IntProperty size mismatch: declared ${size}, expected 4`);
    value = c.i32();
  } else if (type === 'NameProperty' || type === 'ObjectProperty' || type === 'StrProperty') {
    const before = c.offset;
    value = c.fstring();
    if (c.offset - before !== size) throw new Error(`string size mismatch: declared ${size}, actual ${c.offset - before}`);
  } else {
    throw new Error(`unsupported scalar property type ${type}`);
  }
  return { type, value, endOffset: c.offset };
}

// Map's RowHandle struct field name -> the client-facing sourceMap label
// (matches gvasService's INVENTORY_MAPS).
const HANDLE_FIELDS = {
  Items: 'ItemRowHandle',
  'Base Weapons': 'WeaponRowHandle',
  'Damaged Weapons': 'DanglyRowHandle'
};

// How far past a RowHandle marker to search for its RowName/Quantity fields.
// Generously larger than the longest observed entry (the longest DataTable
// path pushes RowName ~250 bytes out); exceeding this is treated as a parse
// failure for that one entry rather than a silent skip.
const SEARCH_WINDOW = 600;

// Parse every inventory entry directly from the raw (decrypted) TempInventory
// blob buffer. Returns { items, errors }: entries that fail strict
// structural validation are reported in `errors`, never silently dropped.
function parseInventoryBlob(buf) {
  const ascii = buf.toString('latin1');
  const items = [];
  const errors = [];
  for (const [sourceMap, handleField] of Object.entries(HANDLE_FIELDS)) {
    const marker = `${handleField}\0`;
    let searchFrom = 0;
    for (;;) {
      const handleIdx = ascii.indexOf(marker, searchFrom);
      if (handleIdx < 0) break;
      searchFrom = handleIdx + 1;
      const windowEnd = handleIdx + SEARCH_WINDOW;
      try {
        const rowNameIdx = ascii.indexOf('RowName\0', handleIdx);
        if (rowNameIdx < 0 || rowNameIdx > windowEnd) throw new Error('RowName field not found within search window');
        const rowName = readScalarField(buf, rowNameIdx, 7);
        if (rowName.type !== 'NameProperty') throw new Error(`unexpected RowName property type ${rowName.type}`);

        const qtyIdx = ascii.indexOf('Quantity\0', rowName.endOffset);
        if (qtyIdx < 0 || qtyIdx > windowEnd) throw new Error('Quantity field not found within search window');
        const qty = readScalarField(buf, qtyIdx, 8);
        if (qty.type !== 'IntProperty') throw new Error(`unexpected Quantity property type ${qty.type}`);

        items.push({ name: rowName.value, quantity: qty.value, sourceMap, validLayout: true });
      } catch (error) {
        errors.push({ sourceMap, offset: handleIdx, error: error.message });
      }
    }
  }
  return { items, errors };
}

module.exports = { parseInventoryBlob };
