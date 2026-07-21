const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Fully-qualified path to the game executable. Override with FW_GAME_EXE when
// the game is installed somewhere unusual (e.g. a non-default Steam library).
const EXE_OVERRIDE = process.env.FW_GAME_EXE || null;
// Explicit game-folder override (the "The Forever Winter" directory).
const DIR_OVERRIDE = process.env.FW_GAME_DIR || null;

const GAME_FOLDER = 'The Forever Winter';
// Candidates checked in the game folder and its subdirs. The shipping binary
// (the real game, with accurate version info) is preferred over the small
// launcher/anti-tamper stub that also sits at the top level. Steam builds use
// "ForeverWinter-...-Shipping.exe"; Epic builds use "TheForeverWinter-...-
// Shipping.exe". Some installs ship the binary without a .exe extension, so
// both forms are tried.
const EXE_CANDIDATES = ['ForeverWinter-Win64-Shipping.exe', 'TheForeverWinter-Win64-Shipping.exe', 'ForeverWinter.exe', 'TheForeverWinter.exe', 'ForeverWinter', 'The Forever Winter.exe'];
// Subdirectories beneath the game folder where the binary may live. Ordered to
// try the nested shipping binary before flatter fallbacks.
const SUBDIRS = [
  path.join('Windows', 'ForeverWinter', 'Binaries', 'Win64'),
  path.join('Windows', 'Binaries'),
  path.join('Windows', 'Engine', 'Binaries', 'Win64'),
  path.join('Binaries', 'Win64'),
  '',
  'Windows',
  'Binaries',
  path.join('Windows', 'ForeverWinter')
];

function listDriveRoots() {
  const roots = [];
  for (let i = 67; i <= 90; i++) {
    const drive = String.fromCharCode(i) + ':\\';
    try { if (fs.existsSync(drive)) roots.push(drive); } catch { /* skip */ }
  }
  return roots;
}

// Steam records extra library folders in steamapps/libraryfolders.vdf.
function parseSteamLibraries(steamRoot) {
  const libs = [];
  const vdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  if (!fs.existsSync(vdf)) return libs;
  try {
    const text = fs.readFileSync(vdf, 'utf8');
    for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) libs.push(m[1]);
  } catch { /* ignore malformed vdf */ }
  return libs;
}

function discoverGameRoots() {
  const roots = new Set();
  if (DIR_OVERRIDE) roots.add(DIR_OVERRIDE);
  for (const drive of listDriveRoots()) {
    const steamRoots = [
      path.join(drive, 'Program Files (x86)', 'Steam'),
      path.join(drive, 'Program Files', 'Steam'),
      path.join(drive, 'SteamLibrary'),
      path.join(drive, 'Steam')
    ];
    for (const sr of steamRoots) {
      if (!fs.existsSync(sr)) continue;
      roots.add(path.join(sr, 'steamapps', 'common', GAME_FOLDER));
      for (const lib of parseSteamLibraries(sr)) {
        roots.add(path.join(lib, 'steamapps', 'common', GAME_FOLDER));
      }
    }
    roots.add(path.join(drive, 'Program Files', 'Epic Games', 'TheForeverWinter'));
    roots.add(path.join(drive, 'Program Files (x86)', 'Epic Games', 'TheForeverWinter'));
  }
  return [...roots];
}

// Reads the installed build from the Steam app manifest, which is the most
// authoritative "current game version" (the exe's own version resource is empty
// on packaged Unreal builds). gameRoot is <library>/steamapps/common/<game>.
function readManifestVersion(gameRoot) {
  const steamapps = path.resolve(gameRoot, '..', '..');
  if (!fs.existsSync(steamapps)) return null;
  let files = [];
  try {
    files = fs.readdirSync(steamapps).filter(f => /^appmanifest_\d+\.acf$/.test(f));
  } catch { return null; }
  for (const f of files) {
    try {
      const text = fs.readFileSync(path.join(steamapps, f), 'utf8');
      const name = (text.match(/"name"\s+"([^"]+)"/) || [])[1] || '';
      if (!/forever winter/i.test(name)) continue;
      const buildid = (text.match(/"buildid"\s+"([^"]+)"/) || [])[1] || null;
      const appid = (text.match(/"appid"\s+"([^"]+)"/) || [])[1] || null;
      if (buildid) return { buildid, appid };
    } catch { /* ignore */ }
  }
  return null;
}

// Epic Games Launcher records installed apps in ProgramData manifests. These
// have no Steam appmanifest, so we match by install location (or name) and read
// whichever version field the manifest exposes.
function readEpicVersion(gameRoot) {
  const manifestsDir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  if (!fs.existsSync(manifestsDir)) return null;
  let files = [];
  try {
    files = fs.readdirSync(manifestsDir).filter(f => f.toLowerCase().endsWith('.item'));
  } catch { return null; }
  const norm = p => (p || '').replace(/[\\/]+$/, '').toLowerCase();
  for (const f of files) {
    try {
      const json = JSON.parse(fs.readFileSync(path.join(manifestsDir, f), 'utf8'));
      const installLoc = norm(json.InstallLocation);
      const name = json.AppName || json.MainGameAppName || '';
      const matches = /forever winter/i.test(name) || (installLoc && norm(gameRoot).startsWith(installLoc));
      if (!matches) continue;
      const version = json.AppVersion || json.BuildLabel || json.BuildVersion || json.VersionLabel || null;
      if (version) return { version: String(version), catalogItemId: json.CatalogItemId || null };
    } catch { /* ignore malformed manifest */ }
  }
  return null;
}

function findGameExe() {
  if (EXE_OVERRIDE && fs.existsSync(EXE_OVERRIDE)) return EXE_OVERRIDE;
  for (const root of discoverGameRoots()) {
    if (!fs.existsSync(root)) continue;
    for (const sub of SUBDIRS) {
      const dir = sub ? path.join(root, sub) : root;
      if (!fs.existsSync(dir)) continue;
      for (const name of EXE_CANDIDATES) {
        const candidate = path.join(dir, name);
        try {
          if (fs.statSync(candidate).isFile()) return candidate;
        } catch { /* skip */ }
      }
    }
  }
  return null;
}

function readFileVersion(exePath) {
  return new Promise((resolve, reject) => {
    const ps = `(Get-Item -LiteralPath '${exePath.replace(/'/g, "''")}').VersionInfo.FileVersion`;
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', err => reject(err));
    child.on('close', code => {
      const out = stdout.trim();
      if (code !== 0 || !out) reject(new Error(stderr.trim() || 'no version'));
      else resolve(out);
    });
  });
}

async function getGameVersion() {
  // Prefer the authoritative build id from the platform app manifest.
  for (const root of discoverGameRoots()) {
    if (!fs.existsSync(root)) continue;
    const manifest = readManifestVersion(root);
    if (manifest) {
      return { detected: true, version: manifest.buildid, source: 'steam-buildid', appId: manifest.appid, path: null };
    }
    const epic = readEpicVersion(root);
    if (epic) {
      return { detected: true, version: epic.version, source: 'epic-manifest', appId: epic.catalogItemId, path: null };
    }
  }
  // Fallback: resolve the binary and report its (often empty) version resource.
  const exe = findGameExe();
  if (exe) {
    try {
      const version = await readFileVersion(exe);
      if (version) return { detected: true, version, source: 'executable', appId: null, path: exe };
    } catch { /* ignore */ }
  }
  return { detected: false, version: null, source: null, appId: null, path: exe || null };
}

module.exports = { getGameVersion };
