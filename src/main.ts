import './style.css';
import OBR from '@owlbear-rodeo/sdk';
import { el, clear } from './dom';
import { renderDicePanel } from './dicePanel';
import { renderCharacterPanel } from './characterPanel';
import { appState } from './state';

function buildShell() {
  const app = document.getElementById('app')!;
  clear(app);

  const header = el('div', { class: 'app-header' },
    el('div', { class: 'app-title' }, '🗡️ 匕首之心'),
    el('div', { class: 'app-sub' }, 'Daggerheart · Owlbear Rodeo'),
  );

  const tabs = el('div', { class: 'tabs' });
  const content = el('div', { class: 'content' });

  const tabDefs = [
    { id: 'dice', label: '🎲 骰子', render: renderDicePanel },
    { id: 'char', label: '📋 角色卡', render: renderCharacterPanel },
  ];

  const btns: HTMLButtonElement[] = [];
  function select(id: string) {
    btns.forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    const def = tabDefs.find((t) => t.id === id)!;
    def.render(content);
  }

  for (const t of tabDefs) {
    const b = el('button', { class: 'tab', onclick: () => select(t.id) }, t.label) as HTMLButtonElement;
    b.dataset.id = t.id;
    btns.push(b);
    tabs.append(b);
  }

  app.append(header, tabs, content);
  select('dice');
}

function connectOBR() {
  try {
    // OBR.isAvailable is a boolean flag (true when embedded in Owlbear Rodeo).
    if (OBR && OBR.isAvailable) {
      OBR.onReady(() => {
        OBR.player.getName().then((n) => { if (n) appState.playerName = n; }).catch(() => {});
        OBR.player.getColor().then((c) => { if (c) appState.playerColor = c; }).catch(() => {});
      });
    }
  } catch {
    /* Running outside Owlbear — UI still works standalone. */
  }
}

buildShell();
connectOBR();
