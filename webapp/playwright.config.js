const { defineConfig } = require('@playwright/test');
const os = require('node:os');
const path = require('node:path');

module.exports = defineConfig({
  testDir: './test/browser',
  timeout: 20000,
  fullyParallel: false,
  outputDir: path.join(os.tmpdir(), 'fwinter-playwright-results'),
  use: { headless: true, viewport: { width: 1280, height: 800 } },
  reporter: 'line'
});
