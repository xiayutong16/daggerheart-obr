// Right-hand toolbar entries for every part of the Daggerheart suite.
//
// Owlbear fixes extension *action* icons to the left/top strip, but custom
// tools created with OBR.tool.create live in the vertical tool rail on the
// right (the one with the hand / pen / text tools). Clicking one opens its
// panel as a popover anchored to that very tool button, so the feature really
// sits in the right sidebar. ToolIcon.filter.roles also lets us hide the GM
// bestiary from players — something the room-level action icon cannot do.
import OBR from '@owlbear-rodeo/sdk';
import type { Role } from './types';

export const SUITE_BASE = 'https://xiayutong16.github.io/daggerheart-obr/';
export const TOOL_NS = 'com.daggerheart-obr/sidebar';

interface ToolDef {
  id: string;
  icon: string;
  label: string;
  url: string;
  width: number;
  height: number;
  gmOnly?: boolean;
}

const TOOLS: ToolDef[] = [
  {
    id: 'dice', icon: 'tool-dice.svg', label: '🎲 匕首之心 · 骰子面板',
    url: `${SUITE_BASE}index.html?panel=1`, width: 460, height: 700,
  },
  {
    id: 'bestiary', icon: 'tool-bestiary.svg', label: '📖 怪物图鉴 · 仅 GM',
    url: `${SUITE_BASE}bestiary/index.html?panel=1`, width: 620, height: 780,
    gmOnly: true,
  },
  {
    id: 'char', icon: 'tool-char.svg', label: '📋 我的角色卡',
    url: `${SUITE_BASE}char/index.html?panel=1`, width: 460, height: 700,
  },
];

/** Call once from the main extension, after OBR is ready. */
export async function setupSidebarTools(_role: Role): Promise<void> {
  if (!OBR.isAvailable) return;
  for (const t of TOOLS) {
    try {
      await OBR.tool.create({
        id: `${TOOL_NS}/${t.id}`,
        icons: [{
          icon: `${SUITE_BASE}${t.icon}`,
          label: t.label,
          ...(t.gmOnly ? { filter: { roles: ['GM'] as ('GM' | 'PLAYER')[] } } : {}),
        }],
        // Returning nothing keeps the currently active Owlbear tool unchanged.
        onClick: async (_ctx, elementId) => {
          await OBR.popover.open({
            id: `${TOOL_NS}/panel-${t.id}`,
            url: t.url,
            width: t.width,
            height: t.height,
            anchorElementId: elementId,
            anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
            transformOrigin: { horizontal: 'RIGHT', vertical: 'TOP' },
          });
        },
      });
    } catch (err) {
      console.warn('sidebar tool unavailable', t.id, err);
    }
  }
}
