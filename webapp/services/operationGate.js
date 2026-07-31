'use strict';

let active = null;

async function runExclusive(label, action) {
  if (active) throw Object.assign(new Error('Another exclusive save operation is active'), { status: 409 });
  const token = Symbol(label);
  active = { token, label, startedAt: new Date().toISOString() };
  try { return await action(); }
  finally { if (active && active.token === token) active = null; }
}

function getState() {
  return active ? { active: true, label: active.label, startedAt: active.startedAt } : { active: false, label: null, startedAt: null };
}

function resetForTests() { active = null; }

module.exports = { runExclusive, getState, resetForTests };
