import { FW, expose } from '../runtime.mjs';

const { api, esc, technicalDetails, appIcon, actionIcon, readIntegerInput, setLocalBusy, setOperationFeedback, showLoading, setRenderedHtml, showToast, receiptHtml, CHARACTER_META, prestigeBonus, PRESTIGE_MAX_FOR_WARNING, PRESTIGE_XP_CAP, WEAPON_META, userMessage, errorDetailHtml } = FW;
function describeItem(...args) { return FW.describeItem(...args); }
function loadCatalog(...args) { return FW.loadCatalog(...args); }

function loadoutWeaponName(tag) {
  if (!tag) return null;
  const m = WEAPON_META[tag];
  return m ? { name: m.name, cat: m.cat } : { name: describeItem(tag).wiki, cat: 'Weapon' };
}

// Render one weapon slot object (from /api/dashboard loadout: {weapon, nickname,
// attachments[]}). Shows the friendly name, internal tag + category, optional
// nickname, and the attached parts list.
function renderLoadoutWeapon(slot, slotLabel) {
  if (!slot || !slot.weapon) return `<span class="dash-empty">—</span>`;
  const info = loadoutWeaponName(slot.weapon);
  let html = `<span class="dash-wname" title="${esc(slot.weapon)}">${esc(info.name)}</span>${technicalDetails(slot.weapon, 'Show weapon technical ID')} <span class="dash-wtag">${esc(info.cat)}</span>`;
  if (slot.nickname) html += ` <span class="dash-wnick">“${esc(slot.nickname)}”</span>`;
  if (slot.attachments && slot.attachments.length) {
    const parts = slot.attachments.map(a => {
      const m = WEAPON_META[a.item];
      const label = m ? m.name : describeItem(a.item).wiki;
      const cat = (a.category || '').replace('ECustomizationType::', '');
      return `<span class="dash-att" title="${esc(a.item)}">${esc(label)}${technicalDetails(a.item, 'Show attachment technical ID')}<small>${esc(cat)}${a.index != null ? ' #' + Number(a.index) : ''}</small></span>`;
    }).join('');
    html += `<details class="dash-attachments-disclosure"><summary>${slot.attachments.length} attachment${slot.attachments.length === 1 ? '' : 's'}</summary><div class="dash-attachments">${parts}</div></details>`;
  }
  return html;
}

function renderDashCharacter(character, loadout) {
  const el = document.getElementById('dashCharacter');
  if (!character) {
    setRenderedHtml(el, '<p class="char-blurb">No selected character found in save (SelectedCharacterTag missing).</p>');
    return;
  }
  const meta = CHARACTER_META[character.tag] || { name: character.shortName, icon: '🔹', health: '?', walk: '?', sprint: '?' };
  const lvl = parseInt(character.level, 10) || 0;
  const bonus = prestigeBonus(lvl);
  const totalHealth = (typeof meta.health === 'number') ? meta.health + bonus.health : '?';
  const capped = lvl >= PRESTIGE_MAX_FOR_WARNING;
  const xpCap = PRESTIGE_XP_CAP[lvl] != null ? PRESTIGE_XP_CAP[lvl] : null;
  const xpPct = (xpCap && character.xp != null) ? Math.min(100, Math.round((character.xp / xpCap) * 100)) : null;

  const rig = loadout && loadout.rig
    ? `<span class="dash-wname">${esc(loadout.rig)}</span>${loadout.rigRow ? technicalDetails(loadout.rigRow, 'Show rig technical ID') : ''}`
    : '<span class="dash-empty">None equipped</span>';

  setRenderedHtml(el, `
    <div class="dash-char-head">
        <span class="dash-char-icon">${appIcon(meta.icon)}</span>
      <div>
        <div class="dash-char-name">${esc(character.shortName)} <span class="char-active-badge">Active</span></div>
        <div class="dash-char-tag">${technicalDetails(character.tag, 'Show character technical ID')}</div>
      </div>
    </div>
    <div class="char-hp">
      <div class="char-hp-total">${totalHealth}<span class="char-hp-unit"> HP</span></div>
      <div class="char-hp-breakdown">base ${meta.health}${bonus.health ? ` + <span class="pos">${bonus.health} prestige</span>` : ''}${bonus.speed ? ` &middot; <span class="pos">+${bonus.speed}% speed</span>` : ''}</div>
    </div>
    <div class="dash-stats">
      <div><span class="k">Prestige Level</span><span class="v">${lvl}${capped ? ' <span class="char-capped" title="Wiki: no further health/speed past 25">&#9888; capped</span>' : ''}</span></div>
      <div><span class="k">Walk / Sprint</span><span class="v">${meta.walk} / ${meta.sprint} m/s</span></div>
      <div class="char-xp-row" style="grid-column: 1 / -1">
        <span class="k">Character XP</span>
        <span class="v">${character.xp != null ? character.xp.toLocaleString() : 0}${xpCap != null ? ` <small>/ ${xpCap.toLocaleString()} cap</small>` : ''}</span>
        ${xpPct != null ? `<span class="char-xp-bar"><span class="char-xp-fill" style="width:${xpPct}%"></span></span>` : ''}
      </div>
    </div>
    <div class="dash-loadout">
      <div class="dash-loadout-row"><span class="dash-slot">Primary</span><div class="dash-slot-body">${renderLoadoutWeapon(loadout && loadout.primary, 'Primary')}</div></div>
      <div class="dash-loadout-row"><span class="dash-slot">Secondary</span><div class="dash-slot-body">${renderLoadoutWeapon(loadout && loadout.secondary, 'Secondary')}</div></div>
      <div class="dash-loadout-row"><span class="dash-slot">Rig Build</span><div class="dash-slot-body">${rig}</div></div>
    </div>`);
}

// Best-effort wiki-sourced quest detail (faction/location/objectives/rewards),
// resolved server-side in saveService.js's questFriendlyData(). Most save
// quest tags don't have a reviewed mapping yet, so q.wiki is null more often
// than not -- that's expected, not a bug (see data/quest-map-overrides.json).
function questWikiDisclosure(wiki) {
  if (!wiki) return '';
  const meta = [wiki.faction, wiki.location, wiki.taskType].filter(Boolean).map(esc).join(' · ');
  const objectives = wiki.objectives.length ? `<ul class="dash-quest-objectives">${wiki.objectives.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : '';
  const rewards = wiki.rewards.length ? `<div class="dash-quest-rewards">${wiki.rewards.map(r => `<span class="dash-quest-reward">${esc(r.item)}${r.quantity ? ` ×${r.quantity.toLocaleString()}` : ''}</span>`).join('')}</div>` : '';
  return `<details class="dash-quest-disclosure"><summary title="Wiki-sourced quest details">Details</summary>${meta ? `<div class="dash-quest-meta">${meta}</div>` : ''}${objectives}${rewards}</details>`;
}

function renderDashQuests(quests) {
  const el = document.getElementById('dashQuests');
  if (!quests || !quests.length) {
    setRenderedHtml(el, '<div class="empty-state"><strong>No quests found</strong><br>The save does not currently expose tracked quests.</div>');
    return;
  }
  const complete = quests.filter(q => q.state === 'complete').length;
  const ready = quests.filter(q => q.state === 'ready').length;
  const inProgress = quests.filter(q => q.state === 'in_progress').length;
  const notStarted = quests.filter(q => q.state === 'not_started').length;
  // Active = not yet turned in (ready + in progress + not started).
  const active = quests.filter(q => q.state === 'ready' || q.state === 'in_progress');

  let html = `<div class="dash-quest-summary">
    <span class="dash-badge complete">${complete} Complete</span>
    <span class="dash-badge ready">${ready} Ready to Turn In</span>
    <span class="dash-badge inprog">${inProgress} In Progress</span>
    <span class="dash-badge notstart">${notStarted} Not Started</span>
  </div>`;

  if (active.length) {
    html += '<div class="dash-quest-list">';
    // Order: ready (most urgent) first, then in progress, then not started.
    const order = { ready: 0, in_progress: 1, not_started: 2 };
    const sorted = [...active].sort((a, b) => order[a.state] - order[b.state]);
    for (const q of sorted.slice(0, 5)) {
      const cls = q.state === 'ready' ? 'ready' : q.state === 'in_progress' ? 'inprog' : 'notstart';
      const statusTxt = q.state === 'ready' ? 'Ready to Turn In' : q.state === 'in_progress' ? 'In Progress' : 'Not Started';
      let detail = '';
      if (q.state === 'in_progress') {
        const done = q.steps.filter(s => s.value > 0).length;
        const total = q.steps.length;
      const progress = Number(q.progress) || 0;
      const prog = progress > 0 ? ` · progress ${progress.toLocaleString()}` : '';
        if (total > 0) detail = `<span class="dash-quest-sub">${done}/${total} objectives${prog}</span>`;
        else if (progress > 0) detail = `<span class="dash-quest-sub">progress ${progress.toLocaleString()}</span>`;
      } else if (q.state === 'ready') {
        detail = `<span class="dash-quest-sub">all conditions met</span>`;
      }
      // Only in-progress quests can be marked ready (experimental).
      const action = q.state === 'in_progress'
        ? `<button class="dash-quest-btn" data-action="quest-ready" data-id="${esc(q.id)}">${actionIcon('check')}Mark Ready to Turn In</button>`
        : '';
      html += `<div class="dash-quest-row ${cls}"><span class="dash-quest-status">${statusTxt}</span><span class="dash-quest-name">${esc(q.name)}${technicalDetails(q.tag, 'Show internal quest tag')}${detail}</span>${questWikiDisclosure(q.wiki)}${action}</div>`;
    }
    html += '</div>';
    if (sorted.length > 5) {
      html += `<details class="dash-quest-more"><summary>Show all ${sorted.length} actionable quests</summary><div class="dash-quest-list">`;
      for (const q of sorted.slice(5)) html += `<div class="dash-quest-row ${q.state === 'ready' ? 'ready' : 'inprog'}"><span class="dash-quest-status">${q.state === 'ready' ? 'Ready to Turn In' : 'In Progress'}</span><span class="dash-quest-name">${esc(q.name)}</span>${questWikiDisclosure(q.wiki)}</div>`;
      html += '</div></details>';
    }
  } else {
    html += '<p class="char-blurb">All quests complete.</p>';
  }
  setRenderedHtml(el, html);
}

function renderDashInventory(inventory) {
  const el = document.getElementById('dashInventory');
  if (!inventory || !inventory.length) {
    setRenderedHtml(el, '<div class="empty-state"><strong>Inventory is empty</strong><br>Open Add Items to add a known item.</div>');
    return;
  }
  const total = inventory.reduce((a, i) => a + i.quantity, 0);
  setRenderedHtml(el, `<div class="inventory-shortcuts"><div class="inventory-metric"><strong>${inventory.length.toLocaleString()}</strong> item types · ${total.toLocaleString()} total units</div><button class="shortcut" data-action="show-page" data-page-target="inventory">${actionIcon('arrowRight')}Manage Inventory</button><button class="shortcut" data-action="show-page" data-page-target="add-items">${actionIcon('arrowRight')}Add Items</button></div>`);
}

// Kept local to this module: ES modules do not share vendor-page helpers.
// The overview uses the same three-stage display without depending on the
// Vendors page having loaded first.
const TRUST_PRESETS = {
  untrusted: -1000,
  trusted: 239000
};

const TRUST_TIER_LABEL = {
  untrusted: 'Untrusted (I)',
  neutral: 'Neutral (II)',
  trusted: 'Trusted (III)'
};

function trustTier(score) {
  if (score >= 150000) return 'trusted';
  if (score >= 0) return 'neutral';
  return 'untrusted';
}

function trustProgress(score) {
  const n = Number(score) || 0;
  if (n < 0) return Math.max(0, Math.min(33, ((n - TRUST_PRESETS.untrusted) / -TRUST_PRESETS.untrusted) * 33));
  if (n < 150000) return 33 + Math.min(33, (n / 150000) * 33);
  return 66 + Math.min(34, ((n - 150000) / (TRUST_PRESETS.trusted - 150000)) * 34);
}

function trustTrack(score) {
  const pct = trustProgress(score);
  return `<div class="trust-track" role="img" aria-label="Faction trust: ${esc(TRUST_TIER_LABEL[trustTier(score)])}; score ${Number(score).toLocaleString()}">
    <div class="trust-track-bar"><span style="width:${pct.toFixed(1)}%"></span><i style="left:${pct.toFixed(1)}%"></i></div>
    <div class="trust-track-labels"><span>Untrusted</span><span>Neutral</span><span>Trusted</span></div>
  </div>`;
}
function renderDashFactionTrust(factions) {
  const el = document.getElementById('dashFactionTrust');
  if (!factions || !factions.length) {
    setRenderedHtml(el, '<div class="empty-state"><strong>No faction scores found</strong></div>');
    return;
  }
  setRenderedHtml(el, `<div class="overview-trust-grid">${factions.map(f => `<article class="overview-trust-card">
    <div class="overview-trust-meta"><span class="overview-trust-name">${esc(f.faction)}</span><span class="overview-trust-score">${Number(f.score).toLocaleString()}</span></div>
    ${trustTrack(f.score)}
  </article>`).join('')}</div>`);
}

// Resource cards: Water + Credits (Currencies table), the three drones, and
// the six Codex variants (all TempInventory items; Drones/Codex reuse the
// inventory update/add endpoints). Codex items are the highest-value loot
// in the game (boss-drop crafting/quest materials -- see
// https://theforeverwinter.wiki.gg/wiki/Codex), not a lore/collectible
// system, so they're presented the same way as any other trackable
// resource. Only variants confirmed present in the 100% reference save are
// listed here (items.canonical.json); the wiki also names Toothy, OrgaMech,
// and Kotleta Codex variants that aren't yet in the canonical catalog, so
// they're intentionally omitted rather than guessed.
const RESOURCE_DEFS = [
  { id: 'WaterBarrels', kind: 'currency', label: 'Water', icon: '💧', cat: 'Water Barrels' },
  { id: 'TestCurrency', kind: 'currency', label: 'Credits', icon: '💰', cat: 'Credits' },
  { id: 'Drone_FastTravel', kind: 'inventory', label: 'Fast Travel Drone', icon: '🚁', cat: 'Utility Drone' },
  { id: 'Drone_Construction', kind: 'inventory', label: 'Construction Drone', icon: '🔧', cat: 'Utility Drone' },
  { id: 'Drone_Recovery', kind: 'inventory', label: 'Recovery Drone', icon: '🛰️', cat: 'Utility Drone' },
  { id: 'Codex.RatKing', kind: 'inventory', label: 'Rat King Codex', icon: '📖', cat: 'Codex' },
  { id: 'Codex.MediumMech', kind: 'inventory', label: 'Medium Mech Codex', icon: '📖', cat: 'Codex' },
  { id: 'Codex.Grabber', kind: 'inventory', label: 'Grabber Codex', icon: '📖', cat: 'Codex' },
  { id: 'CodexShieldOfficer', kind: 'inventory', label: 'Shield Officer Codex', icon: '📖', cat: 'Codex' },
  { id: 'Codex.MotherCourage', kind: 'inventory', label: 'Mother Courage Codex', icon: '📖', cat: 'Codex' },
  { id: 'Codex.Opal', kind: 'inventory', label: 'Opal Codex', icon: '📖', cat: 'Codex' }
];

function renderDashResources(dash) {
  const el = document.getElementById('dashResources');
  const currencies = (dash && dash.currencies) || {};
  const invByName = {};
  if (dash && dash.inventory) {
    for (const i of dash.inventory) invByName[i.name] = i.quantity;
  }

  let html = '<div class="resource-primary">';
  for (const def of RESOURCE_DEFS) {
    const current = def.kind === 'currency'
      ? (currencies[def.id] != null ? currencies[def.id] : 0)
      : (invByName[def.id] != null ? invByName[def.id] : 0);
    const owned = def.kind === 'inventory' && invByName[def.id] != null;
    if (def.id === 'Drone_FastTravel') html += '</div><div class="resource-secondary">';
    else if (def.id === 'Codex.RatKing') html += '</div><div class="resource-tertiary">';
    html += `<div class="res-card ${def.kind === 'currency' ? 'metric' : 'utility'}">
      <div class="res-head">
        <span class="res-icon">${appIcon(def.icon)}</span>
        <span class="res-name">${esc(def.label)}</span>
        <span class="res-cat">${esc(def.cat)}</span>
      </div>
      <output class="res-value" id="resvalue-${def.id}">${Number(current).toLocaleString()}</output>
      <div class="res-controls">
        <input type="number" class="res-input" id="res-${def.id}" placeholder="new qty" min="0" max="2147483647" step="1">
        ${def.kind === 'currency' || owned ? `<button class="res-set icon-only" data-action="set-resource" data-id="${esc(def.id)}" data-kind="${esc(def.kind)}" title="Set ${esc(def.label)} quantity">${actionIcon('check')}<span class="sr-only">Set</span></button>` : ''}
        ${def.kind === 'inventory' && !owned ? `<button class="res-add icon-only" data-action="add-resource" data-id="${esc(def.id)}" title="Add ${esc(def.label)}">${actionIcon('add')}<span class="sr-only">Add</span></button>` : ''}
      </div>
      <div class="res-msg" id="resmsg-${def.id}" role="status" aria-live="polite"></div>
    </div>`;
  }
  html += '</div>';
  setRenderedHtml(el, html);
}

async function setResource(id, kind) {
  const def = RESOURCE_DEFS.find(d => d.id === id);
  const input = document.getElementById('res-' + id);
  const msg = document.getElementById('resmsg-' + id);
  let qty;
  try { qty = readIntegerInput(input, 'Quantity', { min: 0, max: 2147483647 }); } catch (error) {
    msg.className = 'res-msg err';
    msg.textContent = error.message;
    return;
  }
  msg.className = 'res-msg';
  msg.textContent = 'Saving…';
  try {
    const result = kind === 'currency'
      ? await api('/currencies/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ amount: qty }) })
      : await api('/inventory/update', { method: 'POST', body: JSON.stringify({ itemId: id, quantity: qty }) });
    if (!result.afterIntegrity || !result.afterIntegrity.passed) throw new Error('integrity check failed');
    msg.className = 'res-msg ok';
    msg.innerHTML = `Set to ${qty.toLocaleString()}.${receiptHtml(result)}`;
    document.getElementById('resvalue-' + id).textContent = qty.toLocaleString();
    input.value = '';
    showToast(`${def ? def.label : id} set to ${qty.toLocaleString()}.`);
  } catch (err) {
    msg.className = 'res-msg err';
    msg.innerHTML = errorDetailHtml(err, 'This value could not be saved.');
    showToast(`Could not set ${def ? def.label : id}: ${userMessage(err, 'see the error for details')}`, 'error');
  }
}

async function addResource(id) {
  const def = RESOURCE_DEFS.find(d => d.id === id);
  const input = document.getElementById('res-' + id);
  const msg = document.getElementById('resmsg-' + id);
  let qty;
  try { qty = input.value === '' ? 1 : readIntegerInput(input, 'Quantity', { min: 1, max: 2147483647 }); } catch (error) { msg.className = 'res-msg err'; msg.textContent = error.message; return; }
  msg.className = 'res-msg';
  msg.textContent = 'Adding…';
  try {
    let result = await api('/inventory/add', { method: 'POST', body: JSON.stringify({ itemId: id, quantity: qty }) });
    if (result.added === false) {
      // Already present (or game re-added) — fall back to a quantity update.
      result = await api('/inventory/update', { method: 'POST', body: JSON.stringify({ itemId: id, quantity: qty }) });
    }
    if (!result.afterIntegrity || !result.afterIntegrity.passed) throw new Error('integrity check failed');
    msg.className = 'res-msg ok';
    msg.innerHTML = `Added ${qty.toLocaleString()}.${receiptHtml(result)}`;
    document.getElementById('resvalue-' + id).textContent = qty.toLocaleString();
    input.value = '';
    showToast(`Added ${qty.toLocaleString()} ${def ? def.label : id}.`);
  } catch (err) {
    msg.className = 'res-msg err';
    msg.innerHTML = errorDetailHtml(err, 'This item could not be added.');
    showToast(`Could not add ${def ? def.label : id}: ${userMessage(err, 'see the error for details')}`, 'error');
  }
}

// The Vault (home stash) is a separate GVAS blob from TempInventory/Currencies
// -- items and credits stashed here never show up in the Inventory pages or
// the Resources card above, so it gets its own read-only summary. See
// getVaultInventory() in gvasService.js.
function renderDashVault(vault) {
  const el = document.getElementById('dashVault');
  if (!vault) { setRenderedHtml(el, '<div class="empty-state"><strong>Could not load vault</strong></div>'); return; }
  const items = vault.items || [];
  const amount = (vault.currency && vault.currency.amount) || 0;
  const itemChips = items.length
    ? items.map(item => {
        const meta = WEAPON_META[item.name];
        const label = meta ? meta.name : describeItem(item.name).wiki;
        return `<span class="stat-chip" title="${esc(item.tag || item.name)}">${esc(label)}<b>&times;${item.quantity}</b></span>`;
      }).join('')
    : '<span class="dash-empty">No items in the vault</span>';
  setRenderedHtml(el, `
    <div class="dash-stats">
      <div><span class="k">Vault Credits</span><span class="v">${amount.toLocaleString()}</span></div>
      <div><span class="k">Vault Items</span><span class="v">${items.length}</span></div>
    </div>
    <div class="stats-chips">${itemChips}</div>
  `);
}

async function loadDashboard() {
  showLoading(document.getElementById('dashCharacter'), 1, 'Loading character');
  showLoading(document.getElementById('dashQuests'), 3, 'Loading quests');
  showLoading(document.getElementById('dashInventory'), 1, 'Loading inventory');
  showLoading(document.getElementById('dashFactionTrust'), 3, 'Loading faction trust');
  showLoading(document.getElementById('dashResources'), 5, 'Loading resources');
  showLoading(document.getElementById('dashVault'), 2, 'Loading vault');
  try {
    await loadCatalog();
    // Game/writes status pills are refreshSafetyStatus()'s responsibility
    // (system.mjs) -- it's the single source of truth, called on its own
    // poll interval, so this doesn't duplicate that fetch.
    const [dash, vendors, vault] = await Promise.all([
      api('/dashboard').catch(() => null),
      api('/vendors').catch(() => null),
      api('/vault').catch(() => null)
    ]);
    if (dash) {
      renderDashCharacter(dash.character, dash.loadout);
      renderDashQuests(dash.quests);
      renderDashInventory(dash.inventory);
      renderDashResources(dash);
    } else {
      const failMsg = '<div class="empty-state"><strong>Could not load dashboard data</strong></div>';
      setRenderedHtml(document.getElementById('dashCharacter'), failMsg);
      setRenderedHtml(document.getElementById('dashQuests'), failMsg);
      setRenderedHtml(document.getElementById('dashInventory'), failMsg);
      setRenderedHtml(document.getElementById('dashResources'), failMsg);
    }
    renderDashFactionTrust(vendors && vendors.factions);
    renderDashVault(vault);
  } catch (err) {
    const failMsg = `<div class="empty-state"><strong>Could not load dashboard data</strong><br>${errorDetailHtml(err, 'The dashboard could not be read.')}</div>`;
    setRenderedHtml(document.getElementById('dashCharacter'), failMsg);
    setRenderedHtml(document.getElementById('dashQuests'), failMsg);
    setRenderedHtml(document.getElementById('dashInventory'), failMsg);
    setRenderedHtml(document.getElementById('dashFactionTrust'), failMsg);
    setRenderedHtml(document.getElementById('dashResources'), failMsg);
    setRenderedHtml(document.getElementById('dashVault'), failMsg);
  }
}

expose({ loadDashboard, setResource, addResource });

