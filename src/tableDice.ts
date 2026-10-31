// Cast the rolled dice onto the Owlbear table so the whole table sees them.
// We add temporary text items at the centre of the viewport, bounce them in, and
// clean them up a few seconds later — nothing is left behind in the scene.
import OBR, { buildText } from '@owlbear-rodeo/sdk';

const META_KEY = 'com.daggerheart-obr/tableDice';

export interface TableDie {
  text: string;
  color: string;
}

export interface CastOptions {
  dice: TableDie[];
  note?: string;
  /** How long the dice stay on the table after settling (ms). */
  hold?: number;
}

async function clearOld() {
  try {
    const old = await OBR.scene.items.getItems((item) => Boolean(item.metadata?.[META_KEY]));
    if (old.length) await OBR.scene.items.deleteItems(old.map((i) => i.id));
  } catch {
    /* ignore */
  }
}

/**
 * Returns true when the dice were actually placed on the table.
 * Silently no-ops outside Owlbear (browser preview) so the panel keeps working.
 */
export async function castDiceToTable(opts: CastOptions): Promise<boolean> {
  if (!OBR.isAvailable) return false;
  try {
    if (!OBR.isReady) return false;
    await clearOld();

    const [w, h, scale] = await Promise.all([
      OBR.viewport.getWidth(),
      OBR.viewport.getHeight(),
      OBR.viewport.getScale(),
    ]);
    const center = await OBR.viewport.inverseTransformPoint({ x: w / 2, y: h / 2 });
    const safeScale = scale > 0 ? scale : 1;

    const fontSize = 92 / safeScale;
    const gap = fontSize * 1.15;
    const count = Math.max(1, opts.dice.length);
    const startX = center.x - ((count - 1) * gap) / 2;
    const baseY = center.y;

    const items = opts.dice.map((d, i) => {
      const item = buildText()
        .plainText(d.text)
        .fontSize(fontSize)
        .fontWeight(800)
        .fillColor(d.color)
        .textAlign('CENTER')
        .textAlignVertical('MIDDLE')
        .position({ x: startX + i * gap, y: baseY })
        .layer('TEXT')
        .name('匕首之心 · 骰子')
        .metadata({ [META_KEY]: true })
        .build();
      return item;
    });

    const ids = items.map((i) => i.id);
    await OBR.scene.items.addItems(items);

    const noteItem = opts.note
      ? buildText()
          .plainText(opts.note)
          .fontSize(34 / safeScale)
          .fontWeight(700)
          .fillColor('#ece9f5')
          .textAlign('CENTER')
          .textAlignVertical('TOP')
          .position({ x: center.x, y: baseY + fontSize * 0.95 })
          .layer('TEXT')
          .name('匕首之心 · 结果')
          .metadata({ [META_KEY]: true })
          .build()
      : null;
    if (noteItem) {
      ids.push(noteItem.id);
      await OBR.scene.items.addItems([noteItem]);
    }

    // ---- bounce in ----
    const drop = 90 / safeScale;
    const frames = 12;
    for (let f = 1; f <= frames; f++) {
      const t = f / frames;
      // ease-out fall + a single small rebound
      const lift = t < 0.62 ? drop * (1 - Math.pow(t / 0.62, 2)) : drop * 0.12 * Math.abs(Math.cos((t - 0.62) * Math.PI * 2.6));
      await OBR.scene.items.updateItems(ids, (draft) => {
        for (const item of draft) {
          const isNote = noteItem && item.id === noteItem.id;
          if (isNote) item.position = { x: center.x, y: baseY + fontSize * 0.95 - lift * 0.35 };
          else item.position = { x: item.position.x, y: baseY - lift };
          item.rotation = (1 - t) * (isNote ? 0 : (f % 2 === 0 ? 6 : -6));
        }
      });
      await new Promise((r) => setTimeout(r, 42));
    }

    const hold = opts.hold ?? 5200;
    setTimeout(() => {
      void OBR.scene.items.deleteItems(ids).catch(() => {});
    }, hold);
    return true;
  } catch {
    return false;
  }
}
