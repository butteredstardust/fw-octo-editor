#!/usr/bin/env node
// Vendors Chart.js (the "auto" build, all controllers/scales/plugins
// registered) plus its @kurkle/color dependency as plain, dependency-free ES
// modules under webapp/public/vendor/, so the browser can `import` Chart.js
// directly with no bundler and no import map.
//
// Why the "auto" build and not a hand-picked subset: Chart.js only ships
// pre-built entry points for "everything" (chart.js/auto) or "core only,
// register pieces yourself" (chart.js). Trimming to just the chart types we
// use would require a real tree-shaking bundler (webpack/rollup/esbuild),
// which this project deliberately does not have. Correctness and a working
// module graph beat shaving kilobytes here, so we vendor the full auto build.
//
// Why four files instead of one: Chart.js's ESM dist is itself split into
// dist/chart.js + dist/chunks/helpers.dataset.js, and both of those import
// the bare specifier "@kurkle/color" -- something only a bundler or an
// import map can resolve, and this project has neither. So each source file
// is copied byte-for-byte (only import specifiers are rewritten to relative
// paths that point at the other vendored files) into a matching output file.
// The result is a self-contained module graph rooted at chart.mjs: nothing
// in it references a package that isn't sitting right next to it.
//
// Run via: npm run vendor:chart (from webapp/)
// Idempotent: re-running overwrites the same output files with the same
// content (given the same installed package versions).

const fs = require('node:fs');
const path = require('node:path');

const webappRoot = path.join(__dirname, '..');
const nodeModules = path.join(webappRoot, 'node_modules');
const outDir = path.join(webappRoot, 'public', 'vendor');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readSource(relPath) {
  const full = path.join(nodeModules, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Expected source file not found: ${relPath} (looked at ${full}). Run "npm install" first.`);
  }
  return fs.readFileSync(full, 'utf8');
}

function generatedHeader({ sourceFile, packageName, packageVersion }) {
  return [
    '// ============================================================================',
    '// GENERATED FILE -- DO NOT HAND-EDIT.',
    `// Vendored from "${packageName}" v${packageVersion}, source file: ${sourceFile}`,
    '// Produced by webapp/scripts/vendor-chart.js via `npm run vendor:chart`.',
    '// Only import specifiers were rewritten (bare package imports -> relative',
    '// paths to sibling files in this directory); all other code is unmodified.',
    '// To update: bump the chart.js devDependency, run `npm install`, then',
    '// `npm run vendor:chart` again and commit the result.',
    '// ============================================================================',
    ''
  ].join('\n');
}

function main() {
  const chartPkg = readJson(path.join(nodeModules, 'chart.js', 'package.json'));
  const colorPkg = readJson(path.join(nodeModules, '@kurkle', 'color', 'package.json'));

  fs.mkdirSync(outDir, { recursive: true });

  const written = [];

  // 1. @kurkle/color -- no further dependencies, copied verbatim.
  {
    const src = readSource(path.join('@kurkle', 'color', 'dist', 'color.esm.js'));
    const out = generatedHeader({
      sourceFile: '@kurkle/color/dist/color.esm.js',
      packageName: '@kurkle/color',
      packageVersion: colorPkg.version
    }) + src;
    const outPath = path.join(outDir, 'kurkle-color.mjs');
    fs.writeFileSync(outPath, out);
    written.push(outPath);
  }

  // 2. chart.js's internal helpers chunk -- imports "@kurkle/color" (bare);
  //    rewrite to the sibling file we just wrote.
  {
    let src = readSource(path.join('chart.js', 'dist', 'chunks', 'helpers.dataset.js'));
    const before = src;
    src = src.replace(
      /from ['"]@kurkle\/color['"]/,
      "from './kurkle-color.mjs'"
    );
    if (src === before) throw new Error('helpers.dataset.js: expected an "@kurkle/color" import to rewrite, found none -- upstream file layout may have changed.');
    const out = generatedHeader({
      sourceFile: 'chart.js/dist/chunks/helpers.dataset.js',
      packageName: 'chart.js',
      packageVersion: chartPkg.version
    }) + src;
    const outPath = path.join(outDir, 'chart.helpers.mjs');
    fs.writeFileSync(outPath, out);
    written.push(outPath);
  }

  // 3. chart.js core -- imports the helpers chunk by relative path (rewrite
  //    to our renamed sibling) and imports "@kurkle/color" (bare, rewrite).
  {
    let src = readSource(path.join('chart.js', 'dist', 'chart.js'));
    const beforeChunk = src;
    src = src.replace(
      /from ['"]\.\/chunks\/helpers\.dataset\.js['"]/,
      "from './chart.helpers.mjs'"
    );
    if (src === beforeChunk) throw new Error('chart.js: expected a "./chunks/helpers.dataset.js" import to rewrite, found none -- upstream file layout may have changed.');
    const beforeColor = src;
    src = src.replace(
      /import ['"]@kurkle\/color['"];/,
      "import './kurkle-color.mjs';"
    );
    if (src === beforeColor) throw new Error('chart.js: expected an "@kurkle/color" side-effect import to rewrite, found none -- upstream file layout may have changed.');
    const out = generatedHeader({
      sourceFile: 'chart.js/dist/chart.js',
      packageName: 'chart.js',
      packageVersion: chartPkg.version
    }) + src;
    const outPath = path.join(outDir, 'chart.core.mjs');
    fs.writeFileSync(outPath, out);
    written.push(outPath);
  }

  // 4. chart.js "auto" entry -- registers every controller/scale/plugin, and
  //    imports the core by relative path (rewrite to our renamed sibling).
  //    This is the file the app actually imports as vendor/chart.mjs.
  {
    let src = readSource(path.join('chart.js', 'auto', 'auto.js'));
    const before = src;
    src = src.replace(/(['"])\.\.\/dist\/chart\.js\1/g, "'./chart.core.mjs'");
    if (src === before) throw new Error('auto.js: expected a "../dist/chart.js" import to rewrite, found none -- upstream file layout may have changed.');
    const out = generatedHeader({
      sourceFile: 'chart.js/auto/auto.js',
      packageName: 'chart.js',
      packageVersion: chartPkg.version
    }) + src;
    const outPath = path.join(outDir, 'chart.mjs');
    fs.writeFileSync(outPath, out);
    written.push(outPath);
  }

  console.log(`Vendored chart.js v${chartPkg.version} + @kurkle/color v${colorPkg.version} into ${path.relative(webappRoot, outDir)}${path.sep}:`);
  for (const file of written) console.log(`  ${path.relative(webappRoot, file)}`);
  console.log('Entry point for app code: public/vendor/chart.mjs');
}

main();
