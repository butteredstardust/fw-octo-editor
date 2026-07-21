const test=require('node:test');
const assert=require('node:assert/strict');
const data=require('../data/hub-upgrades.json');

test('versioned hub upgrade catalog has unique valid tags and attribution',()=>{
  assert.equal(data.schemaVersion,1);
  assert.match(data.sourceUrl,/^https:\/\//);
  assert.ok(data.verifiedAt);
  const tags=data.upgrades.map(entry=>entry.tag);
  assert.equal(new Set(tags).size,tags.length);
  assert.ok(tags.length>20);
  for(const tag of tags)assert.match(tag,/^Hub\.Upgrade\./);
});
