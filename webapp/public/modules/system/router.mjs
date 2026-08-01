import { FW } from '../runtime.mjs';
import { loadBackups } from './backups.mjs';
import { runDiagnostics } from './diagnostics.mjs';
import { refreshSafetyStatus } from './safety-status.mjs';

const { debounce } = FW;
const feature = name => (...args) => FW[name](...args);

// Page-specific refreshes are intentionally local to the router. The loader
// registry keeps the navigation contract explicit while ensuring each page
// transition can invoke at most its one associated loader. Feature wrappers
// resolve FW at invocation time because those modules register via expose().
const PAGE_LOADERS = new Map([
  ['weapon-builds', feature('loadWeaponBuilds')],
  ['presets', feature('loadPresets')],
  ['vendors', feature('loadVendors')],
  ['stats', feature('loadStats')],
  ['repair', feature('loadRepair')],
  ['add-items', feature('loadAddCatalog')],
  ['rigs', feature('loadRigs')],
  ['settings', feature('loadSettings')],
  ['crafting', feature('loadCrafting')],
  ['backups', loadBackups],
  ['diagnostics', runDiagnostics]
]);

const pageScrollMemory = new Map();
let currentPageName = 'dashboard';

export function closeMobileNav(returnFocus) {
  document.body.classList.remove('nav-open');
  const toggle = document.getElementById('navToggle');
  toggle.setAttribute('aria-expanded', 'false');
  document.getElementById('main-content').removeAttribute('inert');
  document.querySelector('.safety-bar').removeAttribute('inert');
  document.getElementById('navBackdrop').hidden = true;
  if (returnFocus) toggle.focus();
}

// The set of page names that are safe to restore from a URL hash: exactly
// the pages reachable from the sidebar. Anything else (an unknown, stale,
// or hand-edited hash, or the id-less "character" detail page which needs
// runtime state it can't get from a hash alone) must never be trusted --
// it's only ever used as a lookup key against this allow-list, never
// interpolated into the DOM.
function knownPageNames() {
  return new Set([...document.querySelectorAll('.nav button[data-page]')].map(btn => btn.dataset.page));
}

function pageNameFromHash() {
  const raw = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  return knownPageNames().has(raw) ? raw : null;
}

export function showPage(pageName, { fromHistory = false } = {}) {
  const target = document.getElementById(`page-${pageName}`);
  if (!target) return;
  pageScrollMemory.set(currentPageName, window.scrollY);
  document.querySelectorAll('.page').forEach(page => { page.classList.remove('active'); page.hidden = true; });
  document.querySelectorAll('.nav button').forEach(button => { button.classList.remove('active'); button.removeAttribute('aria-current'); });
  target.classList.add('active');
  target.hidden = false;
  const navButton = document.querySelector(`[data-page="${pageName}"]`);
  navButton?.classList.add('active');
  navButton?.setAttribute('aria-current', 'page');
  const heading = target.querySelector('h2, h1');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  document.getElementById('appAnnouncements').textContent = `${navButton ? navButton.textContent : pageName} page opened`;
  currentPageName = pageName;
  closeMobileNav(false);
  requestAnimationFrame(() => window.scrollTo({ top: pageScrollMemory.get(pageName) || 0, behavior: 'instant' }));
  PAGE_LOADERS.get(pageName)?.();
  // fromHistory means this call originated from the browser (a hashchange
  // or popstate event, or the initial-load restore below) -- the URL
  // already reflects pageName, so pushing another entry would double up
  // history and break Back. Only reflect in-app navigation (nav clicks,
  // "show-page" actions) into a new history entry/hash.
  if (!fromHistory && knownPageNames().has(pageName)) {
    const hash = `#${pageName}`;
    if (location.hash !== hash) history.pushState(null, '', hash);
  }
}

document.querySelectorAll('.nav button').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

// Restore whatever page a reload/deep link points at; fall back to the
// default Overview (already the statically-rendered active page) for an
// empty, unknown, or malformed hash rather than trying to guess.
{
  const initialPage = pageNameFromHash();
  if (initialPage && initialPage !== currentPageName) showPage(initialPage, { fromHistory: true });
  else if (location.hash && !initialPage) history.replaceState(null, '', location.pathname + location.search);
}

window.addEventListener('popstate', () => {
  const name = pageNameFromHash() || 'dashboard';
  if (name !== currentPageName) showPage(name, { fromHistory: true });
});
window.addEventListener('hashchange', () => {
  const name = pageNameFromHash() || 'dashboard';
  if (name !== currentPageName) showPage(name, { fromHistory: true });
});

function openMobileNav() {
  const nav = document.getElementById('primaryNav');
  document.body.classList.add('nav-open');
  document.getElementById('navToggle').setAttribute('aria-expanded', 'true');
  document.getElementById('main-content').setAttribute('inert', '');
  document.querySelector('.safety-bar').setAttribute('inert', '');
  document.getElementById('navBackdrop').hidden = false;
  const active = nav.querySelector('button.active') || nav.querySelector('button[data-page]');
  active?.scrollIntoView({ block: 'nearest' });
  document.getElementById('navClose').focus();
}
document.getElementById('navToggle').addEventListener('click', event => {
  if (document.body.classList.contains('nav-open')) {
    closeMobileNav(false);
    return;
  }
  openMobileNav();
  event.currentTarget.blur();
});
document.getElementById('navClose').addEventListener('click', () => closeMobileNav(true));
document.getElementById('navBackdrop').addEventListener('click', () => closeMobileNav(true));
document.getElementById('retryConnectionButton').addEventListener('click', refreshSafetyStatus);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('nav-open')) {
    event.preventDefault();
    closeMobileNav(true);
  } else if (event.key === 'Tab' && document.body.classList.contains('nav-open')) {
    const focusable = [...document.querySelectorAll('#primaryNav #navClose, #primaryNav button[data-page]:not(:disabled)')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

document.querySelector('.nav').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const buttons = [...document.querySelectorAll('.nav button[data-page]')];
  const current = buttons.indexOf(document.activeElement);
  if (current < 0) return;
  event.preventDefault();
  const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + direction + buttons.length) % buttons.length;
  buttons[next].focus();
});

// Keep the sticky sidebar below the actual header, including wrapped status
// chips and browser zoom. ResizeObserver is guarded for older web views.
function updateShellOffset() {
  const header = document.querySelector('.header');
  if (!header) return;
  const rect = header.getBoundingClientRect();
  document.documentElement.style.setProperty('--shell-nav-offset', `${Math.ceil(rect.bottom + 12)}px`);
}
if (typeof ResizeObserver !== 'undefined') {
  const shellObserver = new ResizeObserver(updateShellOffset);
  const header = document.querySelector('.header');
  if (header) shellObserver.observe(header);
}
window.addEventListener('resize', updateShellOffset);
updateShellOffset();

document.querySelectorAll('.page').forEach(page => { page.hidden = !page.classList.contains('active'); });
document.querySelector('[data-page="dashboard"]')?.setAttribute('aria-current', 'page');

// ---- Nav scroll affordance ------------------------------------------------
// At short viewport heights (e.g. 1366x768 laptops) the sidebar nav scrolls
// internally and the whole SYSTEM group (Backups/Diagnostics/Settings) can
// sit below the fold with no visual hint that there's more nav below --
// Backups being the most safety-critical page in the app made this worth a
// dedicated, always-available affordance (in addition to the tighter nav
// density in refinements.css) rather than relying on density tuning alone.
function updateNavScrollHint() {
  const nav = document.getElementById('primaryNav');
  const hint = document.getElementById('navScrollHint');
  if (!nav || !hint) return;
  const hasMoreBelow = nav.scrollHeight - nav.clientHeight - nav.scrollTop > 4;
  hint.classList.toggle('visible', hasMoreBelow);
}
document.getElementById('primaryNav')?.addEventListener('scroll', updateNavScrollHint, { passive: true });
window.addEventListener('resize', debounce(updateNavScrollHint, 100));
updateNavScrollHint();
