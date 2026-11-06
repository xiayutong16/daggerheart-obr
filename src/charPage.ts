// Standalone character sheet page. Deliberately separate from the dice panel:
// the main extension's action popover now only rolls dice, while this page is
// opened by the "我的角色卡" tool in Owlbear's right-hand rail (or directly in
// a browser). The workshop is reachable ONLY through the one button below.
import './style.css';
import OBR from '@owlbear-rodeo/sdk';
import { el } from './dom';
import type { Role } from './types';
import { renderCharacterPanel, applySyncedChar } from './characterPanel';
import { startCharSync } from './charSync';

const CARD_MAKER_URL = 'https://xiayutong16.github.io/daggerheart-obr/card/index.html';

async function detectRole(): Promise<Role> {
  const p = new URLSearchParams(location.search).get('role');
  if (p === 'gm' || p === 'player') return p === 'gm' ? 'GM' : 'PLAYER';
  if (!OBR.isAvailable) return 'PLAYER';
  try {
    await new Promise<void>(res => {
      let done = false;
      const finish = () => { if (!done) { done = true; res(); } };
      try { OBR.onReady(finish); } catch { finish(); }
      setTimeout(finish, 2000);
    });
    return await OBR.player.getRole();
  } catch { return 'PLAYER'; }
}

async function boot() {
  const role = await detectRole();
  const head = document.getElementById('charpage-head')!;
  const body = document.getElementById('charpage-body')!;

  head.append(
    el('div', { class: 'charpage-title' }, '📋 我的角色卡'),
    el('div', { class: 'charpage-sub' }, '骰子面板与角色卡已分成两个独立页面'),
    el('button', {
      class: 'charpage-make',
      title: '在新标签打开车卡工坊，做好后点「同步到枭雄」即可',
      onclick: () => window.open(CARD_MAKER_URL, '_blank', 'noopener'),
    }, '🃏 建立角色卡'),
  );

  renderCharacterPanel(body, role);
  // Live updates pushed from the workshop (same-origin / LOCAL broadcast).
  startCharSync((d) => {
    applySyncedChar(d);
    renderCharacterPanel(body, role);
  });
}

boot();
