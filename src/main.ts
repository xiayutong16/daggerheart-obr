import './style.css';
import OBR from '@owlbear-rodeo/sdk';
import { el, clear } from './dom';
import { renderDicePanel } from './dicePanel';
import { applySyncedChar } from './characterPanel';
import { appState } from './state';
import { startRollLog, setLocalRole, onRemoteRoll, annotateRoll } from './rollLog';
import { isSoundOn, toggleSound } from './sound';
import { FEAR_MAX, gainFear, getFear } from './settle';
import { refreshFearBoards } from './fearBoard';
import { startQuickRolls } from './quickRolls';
import { startCharSync } from './charSync';
import { setupSidebarTools } from './sidebarTools';
import { setupCharToken } from './charToken';
import { startCharCardPage } from './charCard';

let settleWired = false;

/**
 * A player's Fear result has to land in the GM's Fear pool even though the pool
 * lives on the GM's own sheet — so the GM listens to incoming rolls.
 *
 * Every duality roll whose fear die is higher than the hope die carries
 * `tone: 'fear'`, so one point is added no matter what else happened on the roll
 * (success or failure, difficulty set or not, advantage or not).
 */
function wireRemoteSettle() {
  if (settleWired) return;
  settleWired = true;
  onRemoteRoll((entry) => {
    if (appState.role !== 'GM') return;
    if (entry.kind !== 'duality') return;
    if (entry.tone !== 'fear') return;
    if (entry.gmOnly) return;

    const before = getFear();
    const r = gainFear(1);
    const note = r.gained > 0
      ? `恐惧池 +1 → ${r.after}/${FEAR_MAX}`
      : `恐惧池已满 ${FEAR_MAX}，本次未增加`;
    annotateRoll(entry.id, { gmSettle: note });
    if (r.gained > 0) refreshFearBoards({ amount: r.gained, from: entry.author, before });
  });
}

function soundButton() {
  const btn = el('button', {
    class: 'icon-btn',
    title: isSoundOn() ? '音效已开启 · 点击静音' : '音效已关闭 · 点击开启',
    onclick: () => {
      const on = toggleSound();
      btn.textContent = on ? '🔊' : '🔇';
      btn.title = on ? '音效已开启 · 点击静音' : '音效已关闭 · 点击开启';
      btn.classList.toggle('off', !on);
    },
  }, isSoundOn() ? '🔊' : '🔇');
  btn.classList.toggle('off', !isSoundOn());
  return btn;
}

function buildShell() {
  const app = document.getElementById('app')!;
  clear(app);

  const isGM = appState.role === 'GM';

  const header = el('div', { class: 'app-header' },
    el('div', { class: 'title-row' },
      el('div', { class: 'app-title' }, '🗡️ 匕首之心'),
      el('span', { class: 'role-badge ' + (isGM ? 'gm' : 'pl') }, isGM ? 'GM' : '玩家'),
      el('div', { class: 'head-actions' }, soundButton(), appState.embedded ? null : devToggle()),
    ),
    el('div', { class: 'app-sub' }, 'Daggerheart · 骰子面板（角色卡在右侧工具栏）'),
  );

  // Dice only. The character sheet is a separate page (right-rail tool),
  // so this popover never mixes the two anymore.
  const content = el('div', { class: 'content' });
  app.append(header, content);
  renderDicePanel(content, appState.role);
}

/** Only shown outside Owlbear (e.g. browser preview) so you can inspect both views. */
function devToggle() {
  return el('button', {
    class: 'dev-toggle',
    onclick: () => {
      appState.role = appState.role === 'GM' ? 'PLAYER' : 'GM';
      setLocalRole(appState.role);
      buildShell();
    },
  }, appState.role === 'GM' ? '预览玩家端' : '预览 GM 端');
}

async function init() {
  const query = new URLSearchParams(location.search);
  // Floating standalone character card — a completely different page shape.
  if (query.get('mode') === 'charcard') { void startCharCardPage(); return; }
  const isPanel = query.get('panel') === '1';

  try {
    if (OBR && OBR.isAvailable) {
      appState.embedded = true;
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        try { OBR.onReady(finish); } catch { finish(); }
        setTimeout(finish, 1500);
      });
      try { appState.role = await OBR.player.getRole(); } catch {}
      try { const n = await OBR.player.getName(); if (n) appState.playerName = n; } catch {}
      try { const c = await OBR.player.getColor(); if (c) appState.playerColor = c; } catch {}
    } else {
      const p = new URLSearchParams(location.search).get('role');
      appState.role = p === 'player' ? 'PLAYER' : 'GM';
    }
  } catch {
    /* Running outside Owlbear — UI still works standalone. */
  }

  setLocalRole(appState.role);
  startRollLog();
  startQuickRolls();
  // Keep the local sheet copy fresh so right-click "绑定我的角色卡" always
  // binds the latest data. The standalone character page re-renders itself.
  startCharSync((d) => { applySyncedChar(d); });
  // Only the primary extension iframe owns the right-side tools and the
  // token listeners. A panel opened from those tools must not register again.
  if (!isPanel && OBR.isAvailable) {
    try { await setupSidebarTools(appState.role); } catch (err) { console.warn('sidebar tools unavailable', err); }
    try { setupCharToken(appState.role); } catch (err) { console.warn('char token unavailable', err); }
  }
  wireRemoteSettle();
  buildShell();
}

init();
