import { FW, expose } from '../runtime.mjs';

const { api, esc, appIcon, technicalDetails, HUB_UPGRADE_META, HUB_UPGRADE_RECIPES, HUB_UPGRADE_TAGS, HUB_CATEGORY_LABELS, setOperationFeedback, showLoading, setRenderedHtml, confirmAction } = FW;
function addCanonicalComponents(...args) { return FW.addCanonicalComponents(...args); }

let _hubInventory = {};
let _hubUnlockedTags = new Set();
async function loadHubUpgrades() {
  showLoading(document.getElementById('hubUpgradesList'), 8, 'Loading Innards upgrades');
  try {
    const [upgrades, items] = await Promise.all([api('/hub-upgrades'), api('/inventory')]);
    _hubInventory = Object.fromEntries(items.map(item => [item.name, item.quantity]));
    // PlayerUpgrades also contains GIFT.* cosmetics and unrelated gameplay flags.
    // This page models Innards construction only, so intersect the save rows with
    // the reviewed canonical upgrade tags before rendering or counting them.
    const unlockedTags = new Set(
      upgrades
        .map(upgrade => upgrade.upgradeTag)
        .filter(tag => HUB_UPGRADE_RECIPES[tag])
    );
    renderHubUpgrades(unlockedTags);
  } catch (err) {
    setRenderedHtml(document.getElementById('hubUpgradesList'), `<div class="empty-state"><strong>Error</strong><br>${esc(err.message)}</div>`);
  }
}

function renderHubUpgrades(unlockedTags) {
  _hubUnlockedTags = unlockedTags;
  const el = document.getElementById('hubUpgradesList');
  const byCat = { terminals: [], welfare: [], special: [] };
  for (const tag of HUB_UPGRADE_TAGS) {
    const meta = HUB_UPGRADE_META[tag];
    const cat = meta.category || 'terminals';
    byCat[cat].push(tag);
  }

  let html = '<div class="hub-toolbar">' +
    '<span class="hub-bulk-actions" hidden>' +
    '<button data-action="bulk-hub" data-enabled="true">Unlock All Known</button> ' +
    '<button class="danger-btn" data-action="bulk-hub" data-enabled="false">Clear All</button>' +
    '</span>' +
    '<span class="hub-count" id="hubCount"></span>' +
    '</div>';

  for (const cat of ['terminals', 'welfare', 'special']) {
    if (!byCat[cat].length) continue;
    const catId = `hubcat-${cat}`;
    const groups = {};
    for (const tag of byCat[cat]) {
      const g = HUB_UPGRADE_META[tag].group || 'Other';
      (groups[g] = groups[g] || []).push(tag);
    }
    const catBuilt = Object.values(groups).reduce((n, tags) => n + tags.filter(t => unlockedTags.has(t)).length, 0);
    const catTotal = Object.values(groups).reduce((n, tags) => n + tags.length, 0);
    html += `<div class="hub-section">
      <button type="button" class="hub-cat collapsible" data-action="toggle-section" data-target="${catId}" aria-expanded="true"><span class="hub-chevron">▾</span>${HUB_CATEGORY_LABELS[cat]} <span class="hub-cat-count">${catBuilt} / ${catTotal}</span></button>
      <div class="hub-section-body" id="${catId}">`;
     for (const [group, tags] of Object.entries(groups)) {
        const groupId = 'hubgrp-' + cat + '-' + group.replace(/[^a-z0-9]/gi, '');
        const groupBuilt = tags.filter(t => unlockedTags.has(t)).length;
        const groupTotal = tags.length;
        const progress = groupTotal > 1 ? `<span class="hub-group-progress ${groupBuilt === groupTotal ? 'complete' : ''}">${groupBuilt} / ${groupTotal} built</span>` : '';
        html += `<div class="hub-group">
          <button type="button" class="hub-group-title collapsible" data-action="toggle-section" data-target="${groupId}" aria-expanded="true"><span class="hub-chevron">▾</span>${esc(group)} ${progress}</button>
          <div class="hub-cards" id="${groupId}">`;
        for (const tag of tags) {
          const meta = HUB_UPGRADE_META[tag] || { name: tag.split('.').pop(), icon: '🔹', desc: '', group: 'Other' };
          const unlocked = unlockedTags.has(tag);
          const permanent = !!meta.permanent;
          const prereqMet = !meta.prereq || unlockedTags.has(meta.prereq);
          const prereqName = meta.prereq ? (HUB_UPGRADE_META[meta.prereq] ? HUB_UPGRADE_META[meta.prereq].name : meta.prereq) : '';
          const water = meta.water;
          const credits = meta.credits;
          const time = meta.time;
          const reqs = Array.isArray(meta.reqs) ? meta.reqs : [];
          const reqRows = reqs.map(r => {
            const owned = r.itemId && r.writable ? (_hubInventory[r.itemId] || 0) : null;
            const missing = owned == null ? null : Math.max(0, r.qty - owned);
            const status = owned == null ? '<span class="recipe-unverified">not safely writable</span>' : (missing ? '<span class="recipe-missing">missing ' + missing + '</span>' : '<span class="recipe-enough">ready</span>');
            return `<li><span>${r.qty}× ${esc(r.item)}</span><span>${owned == null ? 'holding unknown' : 'have ' + owned} · ${status}</span></li>`;
          }).join('');
          const addableMissing = reqs.filter(r => r.writable && r.itemId && Math.max(0, r.qty - (_hubInventory[r.itemId] || 0)) > 0).length;
          const creditsLine = (credits && credits > 0) ? `<div class="hub-req-line">${appIcon('credits')} ${credits.toLocaleString()} CR</div>` : '';
          const timeLine = time ? `<div class="hub-req-line">${appIcon('time')} Build time: ${esc(time)}</div>` : '';
          const reqBlock = reqs.length
            ? `<details class="hub-reqs"><summary>Required materials (${reqs.length})</summary><ul>${reqRows}</ul>${addableMissing ? `<button type="button" class="btn-ghost" data-action="add-upgrade-materials" data-tag="${esc(tag)}">Add verified missing materials</button>` : ''}</details>`
            : '';
          const canUnlock = !unlocked && prereqMet && !permanent;
          const status = unlocked ? 'unlocked' : (prereqMet ? 'available' : 'locked');
          const statusLabel = unlocked ? 'Unlocked' : (prereqMet ? 'Available to unlock' : 'Locked — needs prerequisite');
          const btn = permanent
            ? `<button disabled class="hub-btn perm-btn" title="Permanent unlock — cannot be changed or removed">Permanent</button>`
            : unlocked
              ? `<button class="hub-btn lock-btn" data-action="toggle-upgrade" data-tag="${esc(tag)}" data-enabled="false">Lock / Remove</button>`
              : `<button class="hub-btn unlock-btn" ${canUnlock ? '' : 'disabled'} data-action="toggle-upgrade" data-tag="${esc(tag)}" data-enabled="true">Unlock</button>`;
          html += `<div class="hub-card ${status} ${permanent ? 'perm' : ''}">
            <div class="hub-card-head">
            <span class="hub-icon">${appIcon(meta.icon)}</span>
              <span class="hub-name">${esc(meta.name)}</span>
              <span class="hub-pill ${status}">${statusLabel}</span>
            </div>
            ${water ? `<div class="hub-cost">${appIcon('water')} ${water} days water to unlock</div>` : ''}
            <div class="hub-desc">${esc(meta.desc || '')}</div>
            ${meta.prereq ? `<div class="hub-prereq ${prereqMet ? '' : 'unmet'}">Requires: ${esc(prereqName)}${prereqMet ? ' ✓' : ' ✗'}</div>` : ''}
            ${creditsLine}${timeLine}${reqBlock}
            ${btn}
          </div>`;
        }
        html += '</div></div>';
      }
    html += '</div></div>';
   }

  setRenderedHtml(el, html);
  updateHubCount(unlockedTags);
}

function toggleSection(id, control) {
  const body = document.getElementById(id);
  if (!body) return;
  const header = control || body.previousElementSibling;
  const collapsed = body.classList.toggle('collapsed');
  if (header) header.classList.toggle('collapsed', collapsed);
  if (header) header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

async function confirmBulkHub(unlockAll) {
  const msg = unlockAll
    ? 'Unlock ALL known Innards upgrades? This overwrites the current set. (Experimental — verify in-game.)'
    : 'Remove ALL Innards upgrades? (Experimental — verify in-game.)';
  if (await confirmAction(msg)) await setHubUpgrades(unlockAll ? HUB_UPGRADE_TAGS : []);
}

function updateHubCount(unlockedTags) {
  const total = HUB_UPGRADE_TAGS.length;
  const on = HUB_UPGRADE_TAGS.filter(t => unlockedTags.has(t)).length;
  const c = document.getElementById('hubCount');
  if (c) c.textContent = `${on} / ${total} known upgrades unlocked`;
}

async function setHubUpgrades(tags) {
  const result = await api('/hub-upgrades', {
    method: 'POST',
    body: JSON.stringify({ tags })
  });
  setOperationFeedback('hubOperationStatus', 'Innards upgrades updated.', result, result.afterIntegrity.passed ? 'success' : 'error');
  loadHubUpgrades();
}

// Unlock or lock a single upgrade. Reads the current unlocked set, then
// adds or removes just this tag before POSTing the full set back.
// Only includes managed upgrade tags (GIFT.* cosmetics are preserved but not sent).
async function toggleHubUpgrade(tag, unlock) {
  const name = HUB_UPGRADE_META[tag]?.name || tag;
  const msg = unlock ? `Unlock ${name}?` : `Lock / remove ${name}? (Experimental — verify in-game.)`;
  if (!await confirmAction(msg)) return;
  const upgrades = await api('/hub-upgrades');
  const tags = upgrades
    .map(u => u.upgradeTag)
    .filter(t => HUB_UPGRADE_RECIPES[t]);
  const has = tags.includes(tag);
  if (unlock && !has) tags.push(tag);
  if (!unlock && has) {
    const i = tags.indexOf(tag);
    tags.splice(i, 1);
  }
  const result = await api('/hub-upgrades', {
    method: 'POST',
    body: JSON.stringify({ tags })
  });
  setOperationFeedback('hubOperationStatus', `${unlock ? 'Unlocked' : 'Removed'} ${HUB_UPGRADE_META[tag]?.name || tag}.`, result, result.afterIntegrity.passed ? 'success' : 'error');
  await loadHubUpgrades();
}

async function addUpgradeMaterials(tag, button) {
  const recipe = HUB_UPGRADE_RECIPES[tag];
  if (!recipe) throw new Error('Upgrade recipe is unavailable.');
  const components = recipe.components.map(component => ({
    ...component,
    total: component.quantity,
    owned: component.itemId ? (_hubInventory[component.itemId] || 0) : null,
    missing: component.itemId ? Math.max(0, component.quantity - (_hubInventory[component.itemId] || 0)) : null
  }));
  const status = document.getElementById('hubCount');
  await addCanonicalComponents(components, _hubInventory, 'missing', status, [button]);
  // Re-render from the already-updated in-memory inventory instead of calling
  // loadHubUpgrades(): that would flash skeleton loaders and refetch the save.
  // addCanonicalComponents already refreshed _hubInventory, and adding materials
  // does not change which upgrades are unlocked, so reuse the cached tag set.
  renderHubUpgrades(_hubUnlockedTags);
}

expose({ loadHubUpgrades, confirmBulkHub, toggleSection, toggleHubUpgrade, addUpgradeMaterials });

// Friendly weapon metadata: scope suffix (after 'Scope.Weapon.') -> {name, cat}.
// Categories use the wiki's weapon classes. Gunhead-specific variants are
// tagged with their own category so they stay visually distinct.
