'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const launcher = require('../bin/launcher');
const { version } = require('../package.json');

test('launcher exposes the health identity expected from the app', () => {
  assert.equal(launcher.APP_ID, 'forever-winter-save-editor');
  assert.equal(launcher.APP_VERSION, version);
});

test('launcher process verification requires the bundled executable and server command', () => {
  const binDir = path.resolve(__dirname, '..', 'bin');
  const nodeExe = path.join(binDir, 'node.exe');
  const server = path.resolve(__dirname, '..', 'server.js');
  const pid = 1234;
  assert.equal(launcher.isInstalledServerProcess(pid, {
    ProcessId: pid,
    ExecutablePath: nodeExe,
    CommandLine: `"${nodeExe}" "${server}"`
  }), true);
  assert.equal(launcher.isInstalledServerProcess(pid, {
    ProcessId: pid,
    ExecutablePath: process.execPath,
    CommandLine: `"${process.execPath}" "${server}"`
  }), false);
  assert.equal(launcher.isInstalledServerProcess(pid, {
    ProcessId: pid,
    ExecutablePath: nodeExe,
    CommandLine: `"${nodeExe}" unrelated.js`
  }), false);
  assert.equal(launcher.isInstalledServerProcess(pid, {
    ProcessId: pid,
    ExecutablePath: nodeExe,
    CommandLine: `"${nodeExe}" unrelated.js --message "${server}"`
  }), false);
});

test('launcher path comparison is case-insensitive but exact', () => {
  assert.equal(launcher.samePath('C:\\Editor\\node.exe', 'c:\\editor\\NODE.EXE'), true);
  assert.equal(launcher.samePath('C:\\Editor\\node.exe.old', 'c:\\editor\\node.exe'), false);
});
