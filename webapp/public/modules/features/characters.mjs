import { FW, expose } from '../runtime.mjs';

// confirmAction was missing from this destructure while both prestige paths
// called it, so every "Apply prestige" click threw "confirmAction is not
// defined" and surfaced as a failed-change banner instead of a confirmation.
const { api, esc, appIcon, actionIcon, technicalDetails, CHARACTER_META, prestigeBonus, PRESTIGE_XP_CAP, PRESTIGE_MAX_FOR_WARNING, readIntegerInput, setOperationFeedback, showLoading, setRenderedHtml, confirmAction, WEAPON_META, loadErrorHtml } = FW;
function showPage(...args) { return FW.showPage(...args); }

async function loadCharacters() {
  showLoading(document.getElementById('charactersList'), 4, 'Loading characters');
  try {
    const [chars, dash] = await Promise.all([api('/characters'), api('/dashboard')]);
    const activeTag = (dash.character && dash.character.tag) || null;
    const el = document.getElementById('charactersList');
    let html = '<div class="char-hint">Each character has a <b>prestige level</b> (0&ndash;50). Prestige raises the XP cap and grants bonus health (and, from prestige 6, movement speed). Bonuses max out at level <strong>24</strong>; higher levels keep that value. Use <b>Set prestige</b> to change the level, or <b>Apply prestige</b> to also reset the character\'s skills to match that level.</div>';
    html += '<div class="char-cards">';
    for (const c of chars) {
      const meta = CHARACTER_META[c.name] || { name: c.name, icon: '🔹', role: '', blurb: '', health: '?', walk: '?', sprint: '?', skills: [] };
      const lvl = parseInt(c.level, 10) || 0;
      const bonus = prestigeBonus(lvl);
      const totalHealth = (typeof meta.health === 'number') ? meta.health + bonus.health : '?';
      const capped = lvl >= PRESTIGE_MAX_FOR_WARNING;
      const isActive = c.name === activeTag;
      const xpCap = PRESTIGE_XP_CAP[lvl] != null ? PRESTIGE_XP_CAP[lvl] : null;
      const overCap = xpCap != null && c.xp != null && c.xp > xpCap;
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
          <div><span class="k">Prestige Lvl</span><span class="v">${lvl}${capped ? ' <span class="char-capped" title="Health and speed bonuses stop increasing past prestige level 24">max</span>' : ''}</span></div>
          <div><span class="k">Walk / Sprint</span><span class="v">${meta.walk} / ${meta.sprint} m/s</span></div>
          <div class="char-xp-row" style="grid-column: 1 / -1">
            <span class="k">XP</span>
            <span class="v">${c.xp != null ? c.xp.toLocaleString() : 0}${xpCap != null ? ` <small>/ ${xpCap.toLocaleString()} cap</small>` : ''}${overCap ? ' <span class="char-xp-over" title="Exceeds this level\'s XP cap">over cap</span>' : ''}</span>
            ${xpPct != null ? `<span class="char-xp-bar${overCap ? ' over' : ''}"><span class="char-xp-fill" style="width:${xpPct}%"></span></span>` : ''}
          </div>
        </div>
        <div class="char-skills"><span class="k">Skills</span><div class="char-skill-tags">${meta.skills.map(s => `<span class="char-skill-tag">${esc(s)}</span>`).join('')}</div></div>
        <div class="char-control">
          <div class="char-control-group">
            <span class="char-control-label">LVL</span>
            <input type="number" id="level-${esc(c.characterId)}" value="${lvl}" min="0" max="50" step="1" class="char-control-input">
            <div class="char-control-actions">
              <button class="btn-primary icon-only" data-action="set-level" data-id="${esc(c.characterId)}" title="Set prestige level">${actionIcon('check')}<span class="sr-only">Set</span></button>
              <button class="danger-btn icon-only" data-action="apply-prestige" data-id="${esc(c.characterId)}" title="Apply: sets the prestige level AND resets this character's skills to match it">${actionIcon('refresh')}<span class="sr-only">Apply</span></button>
            </div>
          </div>
          <div class="char-control-group">
            <span class="char-control-label">XP</span>
            <input type="number" id="xp-${esc(c.characterId)}" value="${esc(c.xp != null ? c.xp : 0)}" min="0" step="1" class="char-control-input">
            <div class="char-control-actions">
              <button class="set icon-only" data-action="set-character-xp" data-id="${esc(c.characterId)}" title="Set XP">${actionIcon('check')}<span class="sr-only">Set</span></button>
              <button class="btn-ghost" data-action="show-character" data-id="${esc(c.characterId)}" title="Open skill editor">${actionIcon('arrowRight')}Skill editor</button>
            </div>
          </div>
        </div>
      </div>`;
    }
    html += '</div>';
    setRenderedHtml(el, html);
  } catch (err) {
    setRenderedHtml(document.getElementById('charactersList'), loadErrorHtml('characters', err));
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
  if (!await confirmAction(`Sets prestige to level ${level} and resets this character's skills to match it.`, { title: 'Apply prestige?', acceptLabel: 'Apply prestige', tone: 'danger', icon: 'refresh' })) return;
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
  // Weapon-variant unlock flag, e.g. PlayerSkill.Gunhead.Head.LMG04 -> code "LMG04".
  // These are independent per-weapon toggles, not a locked sequence, so they're
  // grouped into one "Weapon Variants" track rather than one card per code.
  const m3 = name.match(/^(.*\.Head)\.([A-Za-z]{2,4}\d{1,3}[A-Za-z]?)$/);
  if (m3) {
    return { base: m3[1], tier: 0, kind: 'variant', code: m3[2] };
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
  'PlayerSkill.ScavGirl.SprintingExpert': 'Sprinting Expert'
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
    const { base, tier, kind, code } = parseSkillTrack(s.name);
    (byBase[base] = byBase[base] || { base, kind, nodes: [] }).nodes.push({
      name: s.name, tier, state: s.state === 1, order: tier, code
    });
  }
  const groups = Object.values(byBase).map(g => {
    g.nodes.sort((a, b) => a.order - b.order);
    g.label = g.kind === 'variant' ? 'Weapon Variants' : skillTrackLabel(g.base);
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

// Levels at which the prestige speed bonus steps up (derived from prestigeBonus
// rather than hardcoded, so it stays in sync with core.mjs's PRESTIGE_TABLE).
function speedTierUnlockLevels() {
  const levels = [];
  let last = 0;
  for (let lvl = 1; lvl <= 24; lvl++) {
    const { speed } = prestigeBonus(lvl);
    if (speed > last) { levels.push(lvl); last = speed; }
  }
  return levels;
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
    setRenderedHtml(el, loadErrorHtml('character details', err));
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
  const capped = lvl >= PRESTIGE_MAX_FOR_WARNING;
  const detailXp = details.xp != null ? details.xp : c.xp;
  const detailXpCap = PRESTIGE_XP_CAP[lvl] != null ? PRESTIGE_XP_CAP[lvl] : null;
  const detailOverCap = detailXpCap != null && detailXp != null && detailXp > detailXpCap;

  let html = `<button class="char-back btn-ghost" data-action="show-page" data-page-target="characters">${actionIcon('arrowLeft')}Back to characters</button>`;
  html += `<div class="char-detail-head">
    <span class="char-icon">${appIcon(meta.icon)}</span>
    <div>
      <div class="char-name">${esc(meta.name)}</div>
      <div class="char-role">${esc(meta.role)}</div>
    </div>
  </div>`;
  html += `<div class="char-blurb" style="margin-bottom:.75rem">${esc(meta.blurb)}</div>`;
  html += `<div class="char-detail-stats">
    <span>Prestige Lvl: <b>${lvl}</b>${capped ? ' <span class="char-capped" title="Health and speed bonuses stop increasing past prestige level 24">max</span>' : ''}</span>
    <span>Total Health: <b>${totalHealth}</b>${bonus.health ? ` <small class="pos">(+${bonus.health})</small>` : ''}</span>
    <span>Speed Bonus: <b>${bonus.speed ? '+' + bonus.speed + '%' : '—'}</b></span>
    <span>XP: <b>${detailXp != null ? detailXp.toLocaleString() : 0}</b>${detailXpCap != null ? ` <small>/ ${detailXpCap.toLocaleString()} cap</small>` : ''}${detailOverCap ? ' <span class="char-xp-over" title="Exceeds this level\'s XP cap">over cap</span>' : ''}</span>
  </div>`;
  html += `<div class="char-detail-actions">
    <label>Prestige level <input type="number" class="char-level-input" id="d-level-${esc(c.characterId)}" value="${lvl}" min="0" max="50" step="1"></label>
    <button class="btn-primary" data-action="set-detail-level" data-id="${esc(c.characterId)}">${actionIcon('check')}Set prestige</button>
    <button class="danger-btn" data-action="detail-prestige" data-id="${esc(c.characterId)}" title="Sets the prestige level AND resets this character's skills to match it">${actionIcon('refresh')}Apply Prestige</button>
    <label>XP <input type="number" class="char-xp-input" id="d-xp-${esc(c.characterId)}" value="${esc(details.xp != null ? details.xp : c.xp)}" min="0" step="1"></label>
    <button class="set" data-action="set-detail-xp" data-id="${esc(c.characterId)}">${actionIcon('check')}Set XP</button>
  </div>`;

  html += `<h3 class="char-section-heading">Skill tracks</h3>`;
  html += `<p class="char-hint" style="margin-bottom:1rem">Click a node to enable/disable a skill tier. Higher tiers are locked until the previous tier is enabled (skills must be learned in order). Weapon variant unlocks are independent toggles, not a sequence. Apply saves all changes.</p>`;
  html += '<div class="skill-tracks">';
  for (const g of tracks) {
    html += `<div class="skill-track">
      <div class="skill-track-title">${esc(g.label)}</div>
      <div class="skill-nodes${g.kind === 'variant' ? ' no-sequence' : ''}" data-track="${encodeURIComponent(g.base)}" data-kind="${g.kind}">`;
    if (g.kind === 'variant') {
      const withNames = g.nodes.map(n => ({ ...n, meta: WEAPON_META[n.code] || { name: n.code, cat: '' } }));
      withNames.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
      withNames.forEach(n => {
        const title = n.meta.cat ? `${n.meta.name} — ${n.meta.cat}` : n.meta.name;
        html += `<button type="button" class="skill-node variant ${n.state ? 'on' : ''}" data-action="toggle-skill" data-skill="${encodeURIComponent(n.name)}" aria-pressed="${n.state ? 'true' : 'false'}" title="${esc(title)}">
          <span class="nlabel">${esc(n.meta.name)}</span>
        </button>`;
      });
    } else {
      g.nodes.forEach((n, i) => {
        if (i > 0) html += '<span class="skill-node-connector">→</span>';
        const cls = g.kind === 'gate' ? 'gate' : '';
        html += `<button type="button" class="skill-node ${n.state ? 'on ' + cls : ''}" data-action="toggle-skill" data-skill="${encodeURIComponent(n.name)}" aria-pressed="${n.state ? 'true' : 'false'}">
          <span>${g.kind === 'gate' ? 'Use' : 'v' + n.tier}</span>
        </button>`;
      });
    }
    html += '</div></div>';
  }
  html += '</div>';

  if (prestigeSkills.length) {
    const healthSkills = prestigeSkills.filter(s => s.name.includes('.Health.'));
    const speedSkills = prestigeSkills.filter(s => s.name.includes('.SpeedBuff.'));
    const speedLevels = speedTierUnlockLevels();
    html += `<h3 class="char-section-heading spaced">Prestige bonuses</h3>`;
    html += `<p class="char-hint" style="margin-bottom:1rem">These flags mirror the prestige level set above. They're normally kept in sync by Apply Prestige &mdash; edit them directly only if you know what you're doing.</p>`;
    html += '<div class="skill-tracks">';
    if (healthSkills.length) {
      html += `<div class="skill-track"><div class="skill-track-title">Health Bonus <span class="skill-track-sub">(prestige 2&ndash;25)</span></div><div class="skill-nodes no-sequence">`;
      healthSkills.forEach(s => {
        const lvl = s.name.split('.').pop();
        html += `<button type="button" class="skill-node prestige ${s.state ? 'on' : ''}" data-action="toggle-skill" data-skill="${encodeURIComponent(s.name)}" aria-pressed="${s.state ? 'true' : 'false'}" title="Prestige level ${parseInt(lvl, 10)}"><span>${esc(lvl)}</span></button>`;
      });
      html += '</div></div>';
    }
    if (speedSkills.length) {
      html += `<div class="skill-track"><div class="skill-track-title">Speed Bonus <span class="skill-track-sub">(+4% per tier)</span></div><div class="skill-nodes no-sequence">`;
      speedSkills.forEach((s, i) => {
        const lvl = speedLevels[i];
        html += `<button type="button" class="skill-node prestige ${s.state ? 'on' : ''}" data-action="toggle-skill" data-skill="${encodeURIComponent(s.name)}" aria-pressed="${s.state ? 'true' : 'false'}" title="Unlocks at prestige level ${lvl || '?'}"><span>${lvl ? '@' + lvl : esc(s.name.split('.').pop())}</span></button>`;
      });
      html += '</div></div>';
    }
    html += '</div>';
  }

  html += `<div style="margin-top:1.25rem"><button class="hub-btn unlock-btn" data-action="apply-skills" data-id="${esc(c.characterId)}">${actionIcon('save')}Apply skills</button></div>`;

  setRenderedHtml(el, html);
  refreshSkillNodeLocks();
}

// Enforce ordering: a tier node is clickable only if the previous tier (lower
// order) in the same track is enabled. Locked nodes get a 'locked' class.
function refreshSkillNodeLocks() {
  document.querySelectorAll('#characterDetail .skill-track').forEach(track => {
    const nodesWrap = track.querySelector('.skill-nodes');
    if (nodesWrap && nodesWrap.classList.contains('no-sequence')) return; // independent toggles, no locking
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
  if (!await confirmAction(`Sets prestige to level ${level} and resets this character's skills to match it.`, { title: 'Apply prestige?', acceptLabel: 'Apply prestige', tone: 'danger', icon: 'refresh' })) return;
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

