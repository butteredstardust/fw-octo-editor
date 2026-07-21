const test = require('node:test');
const assert = require('node:assert/strict');
const { toInteger, sqlStr, requireChangedRows } = require('../services/saveService');

test('integer validation rejects fractions, unsafe values, and out-of-range values', () => {
  assert.equal(toInteger('42','amount',{min:0,max:100}),42);
  for(const value of [1.5,NaN,Infinity,101,-1,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>toInteger(value,'amount',{min:0,max:100}));
});

test('SQL strings escape quotes and reject shell-breaking controls', () => {
  assert.equal(sqlStr("O'Brien",'name'),"O''Brien");
  assert.throws(()=>sqlStr('line\nbreak','name'));
  assert.throws(()=>sqlStr('nul\0byte','name'));
});

test('changed-row checks fail closed on zero or excessive changes', () => {
  assert.equal(requireChangedRows('1',1,'test'),1);
  assert.throws(()=>requireChangedRows('0',1,'test'));
  assert.throws(()=>requireChangedRows('2',1,'test'));
});
