import { FW, expose } from '../runtime.mjs';

const { api, esc, appIcon, technicalDetails, CHARACTER_META, prestigeBonus, PRESTIGE_XP_CAP, PRESTIGE_MAX_FOR_WARNING, readIntegerInput, setOperationFeedback, showLoading, setRenderedHtml } = FW;
function showPage(...args) { return FW.showPage(...args); }

async function loadCharacters() {
  showLoading(document.getElementById('charactersList'), 4, 'Loading characters');
  try {
    const [chars, dash] = await Promise.all([api('/characters'), api('/dashboard')]);
    const activeTag = (dash.character && dash.character.tag) || null;
    const el = document.getElementById('charactersList');
    let html = '<div class="char-hint">Each character has a <b>prestige level</b> (0&ndash;50). Prestige raises the XP cap and grants bonus health (and, from prestige 6, movement speed). Per the wiki, levels past <strong>25</strong> grant no further stats. Use <b>Set Prestige</b> to change the level, or <b>Apply Prestige</b> to also reset the character\'s skills to match that level.</div>';
    html += '<div class="char-cards">';
    for (const c of chars) {
      const meta = CHARACTER_META[c.name] || { name: c.name, icon: '🔹', role: '', blurb: '', health: '?', walk: '?', sprint: '?', skills: [] };
      const lvl = parseInt(c.level, 10) || 0;
      const bonus = prestigeBonus(lvl);
      const totalHealth = (typeof meta.health === 'number') ? meta.health + bonus.health : '?';
      const capped = lvl >= PRESTIGE_MAX_FOR_WARNING;
      const isActive = c.name === activeTag;
      const xpCap = PRESTIGE_XP_CAP[lvl] != null ? PRESTIGE_XP_CAP[lvl] : null;
      const xpPct = (xpCap && c.xp != null) ? Math.min(100, Math.round((c.xp / xpCap) * 100)) : null;
      html += `<div class="char-card${isActive ? ' active' : ''}">
        <div class="char-head">
          <span class="char-icon">${appIcon(meta.icon)}</span>
          <div>
            <div class="char-name">${esc(meta.name)}${isActive ? ' <span class="char-active-badge">Active</span>' : ''}</div>
            <div class="char-role">${esc(meta.role)}</div>
          </div>
        </div>
        <div class="char-blurb">${esc(meta.blurb)}</div>
        <div class="char-hp">
          <div class="char-hp-total">${totalHealth}<span class="char-hp-unit"> HP</span></div>
          <div class="char-hp-breakdown">base ${meta.health}${bonus.health ? ` + <span class="pos">${bonus.health} prestige</span>` : ''}${bonus.speed ? ` &middot; <span class="pos">+${bonus.speed}% speed</span>` : ''}</div>
        </div>
        <div class="char-stats">
          <div><span class="k">Prestige Lvl</span><span class="v">${lvl}${capped ? ' <span class="char-capped" title="Wiki: no further health/speed past 25">&#9888; capped</span>' : ''}</span></div>
          <div><span class="k">Walk / Sprint</span><span class="v">${meta.walk} / ${meta.sprint} m/s</span></div>
          <div class="char-xp-row" style="grid-column: 1 / -1">
            <span class="k">XP</span>
            <span class="v">${c.xp != null ? c.xp.toLocaleString() : 0}${xpCap != null ? ` <small>/ ${xpCap.toLocaleString()} cap</small>` : ''}</span>
            ${xpPct != null ? `<span class="char-xp-bar"><span class="char-xp-fill" style="width:${xpPct}%"></span></span>` : ''}
          </div>
        </div>
        <div class="char-skills"><span class="k">Skills:</span> ${meta.skills.map(esc).join(', ')}</div>
        <div class="char-control">
          <div class="char-control-group">
            <span class="char-control-label">LVL</span>
            <input type="number" id="level-${esc(c.characterId)}" value="${lvl}" min="0" max="50" step="1" class="char-control-input">
            <div class="char-control-actions">
              <button class="btn-primary" data-action="set-level" data-id="${esc(c.characterId)}">Set</button>
              <button class="btn-warn" data-action="apply-prestige" data-id="${esc(c.characterId)}" title="Sets the prestige level AND resets this character's skills to match it">Apply</button>
            </div>
          </div>
          <div class="char-control-group">
            <span class="char-control-label">XP</span>
            <input type="number" id="xp-${esc(c.characterId)}" value="${esc(c.xp != null ? c.xp : 0)}" min="0" step="1" class="char-control-input">
            <div class="char-control-actions">
              <button data-action="set-character-xp" data-id="${esc(c.characterId)}">Set</button>
              <button class="btn-ghost" data-action="show-character" data-id="${esc(c.characterId)}">Open Skill Editor &rarr;</button>
            </div>
          </div>
        </div>
      </div>`;
    }
    html += '</div>';
    setRenderedHtml(el, html);
  } catch (err) {
    setRenderedHtml(document.getElementById('charactersList'), `<div class="empty-state"><strong>Error</strong><br>${esc(err.message)}</div>`);
  }
}

async function setLevel(charId) {
  const level = readIntegerInput(document.getElementById(`level-${charId}`), 'Prestige level', { min: 0, max: 50 });
  const result = await api(`/characters/${charId}/level`, {
    method: 'PUT',
    body: JSON.stringify({ level })
  });
  setOperationFeedback('charactersOperationStatus', `Prestige level set to ${level}.`, result, result.afterIntegrity.passed ? 'success' : 'error');
  loadCharacters();
}

async function prestige(charId) {
  const level = readIntegerInput(document.getElementById(`level-${charId}`), 'Prestige level', { min: 0, max: 50 });
  if (!await confirmAction(`Apply prestige level ${level}? This resets skills and sets the prestige level.`)) return;
  const result = await api('/characters/prestige', {
    method: 'POST',
    body: JSON.stringify({ characterId: charId, targetLevel: level })
  });
  setOperationFeedback('charactersOperationStatus', `Prestige applied at level ${level}; ${result.skillsUpdated} skills updated.`, result, result.afterIntegrity.passed ? 'success' : 'error');
  loadCharacters();
}

async function setCharXp(charId) {
  const xp = readIntegerInput(document.getElementById(`xp-${charId}`), 'Character XP', { min: 0 });
  const result = await api(`/characters/${charId}/xp`, {
    method: 'PUT',
    body: JSON.stringify({ xp })
  });
  setOperationFeedback('charactersOperationStatus', `Character XP set to ${xp.toLocaleString()}.`, result, result.afterIntegrity.passed ? 'success' : 'error');
  loadCharacters();
}

// ---- Per-character detail page (skill tracks) ----

// Parse a skill name into a track base + tier index so tiers can be ordered
// and gated. Examples:
//   PlayerSkill.Global.SprintingExpert.v1  -> base "...SprintingExpert", tier 1
//   PlayerSkill.Global.Stamina_03          -> base "...Stamina",          tier 3
//   PlayerSkill.Global.GRL.AllowUse       -> base "...GRL",              tier 0 (gate)
//   PlayerSkill.Gunhead.Head.LMG04         -> base "...Head.LMG04",       tier 0 (single)
function parseSkillTrack(name) {
  const m = name.match(/\.v(\d+)$/);          // .v1 .. .v5
  if (m) {
    const base = name.replace(/\.v\d+$/, '');
    return { base, tier: parseInt(m[1], 10), kind: 'tier' };
  }
  const m2 = name.match(/_(\d+)$/);            // Stamina_01 .. _05
  if (m2) {
    const base = name.replace(/_\d+$/, '');
    return { base, tier: parseInt(m2[1], 10), kind: 'tier' };
  }
  if (name.endsWith('.AllowUse')) {           // prerequisite gate (single)
    return { base: name.replace(/\.AllowUse$/, ''), tier: 0, kind: 'gate' };
  }
  return { base: name, tier: 0, kind: 'single' };
}

// Friendly labels for known track bases; falls back to prettified base name.
const SKILL_LABELS = {
  'PlayerSkill.Global.SprintingExpert': 'Sprinting Expert',
  'PlayerSkill.Global.PSTExpert': 'PST Expert (Pistols)',
  'PlayerSkill.Global.SMGExpert': 'SMG Expert',
  'PlayerSkill.Global.RFLExpert': 'RFL Expert (Rifles)',
  'PlayerSkill.Global.SHGExpert': 'SHG Expert (Shotguns)',
  'PlayerSkill.Global.HRFExpert': 'HRF Expert (Heavy Rifles)',
  'PlayerSkill.Global.LMGExpert': 'LMG Expert',
  'PlayerSkill.Global.HMGExpert': 'HMG Expert',
  'PlayerSkill.Global.GRLExpert': 'GRL Expert (Grenade Launchers)',
  'PlayerSkill.Global.GRL': 'Grenade Launchers (use)',
  'PlayerSkill.Global.HRF': 'Heavy Rifles (use)',
  'PlayerSkill.Global.LMG': 'LMG (use)',
  'PlayerSkill.Global.Stamina': 'Stamina Training',
  'PlayerSkill.BagMan.PackMule': 'Carry Capacity (Pack Mule)',
  'PlayerSkill.OldMan.MedicalExpert': 'Medical Expert',
  'PlayerSkill.ScavGirl.SprintingExpert': 'Sprinting Expert',
  'PlayerSkill.Gunhead.Head': 'Gunhead Variant'
};

function skillTrackLabel(base) {
  if (SKILL_LABELS[base]) return SKILL_LABELS[base];
  const tail = base.split('.').pop();
  return tail
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/Expert|Training|AllowUse|PackMule|Medical|Head|Gunhead|Global|PlayerSkill/g, m => m)
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Build ordered track groups from a flat skill list. Each group:
// { base, label, kind, nodes: [{name, tier, state, order}] } sorted by tier.
function buildSkillTracks(skills) {
  const byBase = {};
  for (const s of skills) {
    if (s.name.startsWith('PlayerSkill.Prestige.')) continue; // handled separately
    const { base, tier, kind } = parseSkillTrack(s.name);
    (byBase[base] = byBase[base] || { base, kind, nodes: [] }).nodes.push({
      name: s.name, tier, state: s.state === 1, order: tier
    });
  }
  const groups = Object.values(byBase).map(g => {
    g.nodes.sort((a, b) => a.order - b.order);
    g.label = skillTrackLabel(g.base);
    return g;
  });
  // Keep a stable, readable order: globals first, then character-specific.
  groups.sort((a, b) => {
    const ag = a.base.includes('.Global.'), bg = b.base.includes('.Global.');
    if (ag !== bg) return ag ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return groups;
}

async function showCharacter(charId) {
  showPage('character');
  await loadCharacterDetail(charId);
}

async function loadCharacterDetail(charId) {
  const el = document.getElementById('characterDetail');
  showLoading(el, 3, 'Loading character');
  try {
    const chars = await api('/characters');
    const c = chars.find(x => x.characterId === charId) || { characterId: charId, name: charId, level: 0, xp: 0 };
    const details = await api(`/characters/${charId}/details`);
    renderCharacterDetail(c, details);
  } catch (err) {
    el.textContent = 'Error: ' + err.message;
  }
}

function renderCharacterDetail(c, details) {
  const el = document.getElementById('characterDetail');
  const meta = CHARACTER_META[c.name] || { name: c.name.replace('Pawn.Player.', ''), icon: '🔹', role: '', blurb: '', health: '?', walk: '?', sprint: '?' };
  const lvl = parseInt(c.level, 10) || 0;
  const bonus = prestigeBonus(lvl);
  const totalHealth = (typeof meta.health === 'number') ? meta.health + bonus.health : '?';
  const tracks = buildSkillTracks(details.skills || []);
  const prestigeSkills = (details.skills || []).filter(s => s.name.startsWith('PlayerSkill.Prestige.'));

  let html = `<button class="char-back" data-action="show-page" data-page-target="characters">← Back to Characters</button>`;
  html += `<div class="char-detail-head">
    <span class="char-icon">${appIcon(meta.icon)}</span>
    <div>
      <div class="char-name">${esc(meta.name)}</div>
      <div class="char-role">${esc(meta.role)}</div>
    </div>
  </div>`;
  html += `<div class="char-blurb" style="margin-bottom:.75rem">${esc(meta.blurb)}</div>`;
  html += `<div class="char-detail-stats">
    <span>Prestige Lvl: <b>${lvl}</b></span>
    <span>Total Health: <b>${totalHealth}</b>${bonus.health ? ` <small class="pos">(+${bonus.health})</small>` : ''}</span>
    <span>Speed Bonus: <b>${bonus.speed ? '+' + bonus.speed + '%' : '—'}</b></span>
    <span>XP: <b>${details.xp != null ? (details.xp).toLocaleString() : (c.xp != null ? c.xp.toLocaleString() : 0)}</b>${PRESTIGE_XP_CAP[lvl] != null ? ` <small>/ ${(PRESTIGE_XP_CAP[lvl]).toLocaleString()} cap</small>` : ''}</span>
  </div>`;
  html += `<div class="char-detail-actions">
    <label>Prestige level <input type="number" class="char-level-input" id="d-level-${esc(c.characterId)}" value="${lvl}" min="0" max="50" step="1"></label>
    <button class="btn-primary" data-action="set-detail-level" data-id="${esc(c.characterId)}">Set Prestige</button>
    <button class="btn-warn" data-action="detail-prestige" data-id="${esc(c.characterId)}" title="Sets the prestige level AND resets this character's skills to match it">Apply Prestige</button>
    <label>XP <input type="number" class="char-xp-input" id="d-xp-${esc(c.characterId)}" value="${esc(details.xp != null ? details.xp : c.xp)}" min="0" step="1"></label>
    <button data-action="set-detail-xp" data-id="${esc(c.characterId)}">Set XP</button>
  </div>`;

  html += `<h3 class="char-section-heading">Skill Tracks</h3>`;
  html += `<p class="char-hint" style="margin-bottom:1rem">Click a node to enable/disable a skill tier. Higher tiers are locked until the previous tier is enabled (skills must be learned in order). Apply saves all changes.</p>`;
  html += '<div class="skill-tracks">';
  for (const g of tracks) {
    html += `<div class="skill-track">
      <div class="skill-track-title">${esc(g.label)}</div>
      <div class="skill-nodes" data-track="${encodeURIComponent(g.base)}">`;
    g.nodes.forEach((n, i) => {
      if (i > 0) html += '<span class="skill-node-connector">→</span>';
      const cls = g.kind === 'gate' ? 'gate' : '';
      html += `<button type="button" class="skill-node ${n.state ? 'on ' + cls : ''}" data-action="toggle-skill" data-skill="${encodeURIComponent(n.name)}" aria-pressed="${n.state ? 'true' : 'false'}">
        <span>${g.kind === 'gate' ? 'Use' : 'v' + n.tier}</span>
      </button>`;
    });
    html += '</div></div>';
  }
  html += '</div>';

  if (prestigeSkills.length) {
    html += `<h3 class="char-section-heading spaced">Prestige Bonuses</h3><div class="skill-tracks">`;
    const pg = { base: 'Prestige', label: 'Prestige (Health / Speed)', kind: 'single', nodes: prestigeSkills.map(s => ({ name: s.name, tier: 0, state: s.state === 1, order: 0 })) };
    html += `<div class="skill-track"><div class="skill-track-title">${pg.label}</div><div class="skill-nodes">`;
    pg.nodes.forEach(n => {
      html += `<button type="button" class="skill-node ${n.state ? 'on' : ''}" data-action="toggle-skill" data-skill="${encodeURIComponent(n.name)}" aria-pressed="${n.state ? 'true' : 'false'}"><span>${esc(n.name.split('.').pop())}</span></button>`;
    });
    html += '</div></div></div>';
  }

  html += `<div style="margin-top:1.25rem"><button class="hub-btn unlock-btn" data-action="apply-skills" data-id="${esc(c.characterId)}">Apply Skills</button></div>`;

  setRenderedHtml(el, html);
  refreshSkillNodeLocks();
}

// Enforce ordering: a tier node is clickable only if the previous tier (lower
// order) in the same track is enabled. Locked nodes get a 'locked' class.
function refreshSkillNodeLocks() {
  document.querySelectorAll('#characterDetail .skill-track').forEach(track => {
    const nodes = Array.from(track.querySelectorAll('.skill-node'));
    let prevOn = true;
    nodes.forEach(node => {
      if (!prevOn) {
        node.classList.add('locked');
        node.setAttribute('aria-disabled', 'true');
      } else {
        node.classList.remove('locked');
        node.removeAttribute('aria-disabled');
      }
      prevOn = node.classList.contains('on');
    });
  });
}

function toggleSkillNode(node) {
  if (node.classList.contains('locked')) return;
  node.classList.toggle('on');
  node.setAttribute('aria-pressed', node.classList.contains('on') ? 'true' : 'false');
  refreshSkillNodeLocks();
}

async function applyDetailSkills(charId) {
  const nodes = document.querySelectorAll('#characterDetail .skill-node');
  const skills = Array.from(nodes).map(n => ({
    name: decodeURIComponent(n.dataset.skill),
    state: n.classList.contains('on')
  }));
  const result = await api(`/characters/${charId}/skills`, {
    method: 'POST',
    body: JSON.stringify({ skills })
  });
  setOperationFeedback('characterOperationStatus', `${result.skillsUpdated} skill states applied.`, result, result.afterIntegrity.passed ? 'success' : 'error');
  loadCharacterDetail(charId);
}

async function setDetailLevel(charId) {
  const level = readIntegerInput(document.getElementById(`d-level-${charId}`), 'Prestige level', { min: 0, max: 50 });
  const result = await api(`/characters/${charId}/level`, {
    method: 'PUT', body: JSON.stringify({ level })
  });
  setOperationFeedback('characterOperationStatus', `Prestige level set to ${level}.`, result, result.afterIntegrity.passed ? 'success' : 'error');
  loadCharacterDetail(charId);
}

async function detailPrestige(charId) {
  const level = readIntegerInput(document.getElementById(`d-level-${charId}`), 'Prestige level', { min: 0, max: 50 });
  if (!await confirmAction(`Apply prestige level ${level}? This resets skills and sets the prestige level.`)) return;
  const result = await api('/characters/prestige', {
    method: 'POST', body: JSON.stringify({ characterId: charId, targetLevel: level })
  });
  setOperationFeedback('characterOperationStatus', `Prestige applied at level ${level}; ${result.skillsUpdated} skills updated.`, result, result.afterIntegrity.passed ? 'success' : 'error');
  loadCharacterDetail(charId);
}

async function setDetailXp(charId) {
  const xp = readIntegerInput(document.getElementById(`d-xp-${charId}`), 'Character XP', { min: 0 });
  const result = await api(`/characters/${charId}/xp`, {
    method: 'PUT', body: JSON.stringify({ xp })
  });
  setOperationFeedback('characterOperationStatus', `Character XP set to ${xp.toLocaleString()}.`, result, result.afterIntegrity.passed ? 'success' : 'error');
  loadCharacterDetail(charId);
}

expose({ loadCharacters, setLevel, prestige, setCharXp, showCharacter, loadCharacterDetail, setDetailLevel, detailPrestige, setDetailXp, toggleSkillNode, applyDetailSkills });

