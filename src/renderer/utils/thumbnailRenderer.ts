/* eslint-disable no-plusplus */
// src/renderer/utils/thumbnailRenderer.ts
// Renders a 1280x720 PNG thumbnail for a tournament set using HTML5 Canvas
import type {
  GameSet,
  GameEntry,
  EventThumbnailSettings,
  SlpPlayerData,
} from '../../common/meleeTypes';
import {
  getSidePlayersAcrossGames,
  resolvePlayerName,
  deduplicatePlayers,
  formatContext,
} from '../../common/setUtils';
import { getCharacterName } from '../../common/meleeResources';

const WIDTH = 1280;
const HEIGHT = 720;

const FONT_FAMILY = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

// ---------------------------------------------------------------------------
// Helper functions (defined before main export to satisfy no-use-before-define)
// ---------------------------------------------------------------------------

/** Unique characters played by a side, ordered by frequency. */
function getUniqueCharacters(
  sidePlayers: SlpPlayerData[],
): { characterId: number; colorId: number }[] {
  const counts = new Map<number, number>();
  const firstSeen = new Map<number, number>();
  const charColor = new Map<number, number>();
  let order = 0;

  sidePlayers.forEach((p) => {
    if (p.characterId != null) {
      counts.set(p.characterId, (counts.get(p.characterId) ?? 0) + 1);
      if (!firstSeen.has(p.characterId)) {
        firstSeen.set(p.characterId, order);
        charColor.set(p.characterId, p.characterColor ?? 0);
        order += 1;
      }
    }
  });

  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return (firstSeen.get(a[0]) ?? 0) - (firstSeen.get(b[0]) ?? 0);
    })
    .map(([charId]) => ({
      characterId: charId,
      colorId: charColor.get(charId) ?? 0,
    }));
}

/** Load an image from a data URL or file URL. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/** Load an image from a local file path via the video server. */
function loadLocalImage(
  filePath: string,
  serverPort: number,
  serverToken: string,
): Promise<HTMLImageElement> {
  const url = `http://127.0.0.1:${serverPort}/file?token=${encodeURIComponent(serverToken)}&path=${encodeURIComponent(filePath)}`;
  return loadImage(url);
}

/** Fit text within maxWidth by progressively shrinking font size. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  bold: boolean,
): number {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT_FAMILY}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return minSize;
}

/** Draw text with a drop shadow. */
function drawTextWithShadow(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: 'left' | 'right' | 'center',
  color: string,
) {
  ctx.textAlign = align;
  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillText(text, x + 2, y + 2);
  // Main text
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Draw a split background with an angled diagonal divider. */
function drawSplitBackground(
  ctx: CanvasRenderingContext2D,
  leftColor: string,
  rightColor: string,
) {
  ctx.fillStyle = leftColor;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(WIDTH / 2 + 40, 0);
  ctx.lineTo(WIDTH / 2 - 40, HEIGHT);
  ctx.lineTo(0, HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = rightColor;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 + 40, 0);
  ctx.lineTo(WIDTH, 0);
  ctx.lineTo(WIDTH, HEIGHT);
  ctx.lineTo(WIDTH / 2 - 40, HEIGHT);
  ctx.closePath();
  ctx.fill();
}

/** Draw a player name with auto-shrinking text. */
function drawPlayerName(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  align: 'left' | 'right' | 'center',
  maxWidth: number,
  color: string,
) {
  const size = fitText(ctx, name, maxWidth, 48, 28, true);
  ctx.font = `bold ${size}px ${FONT_FAMILY}`;
  drawTextWithShadow(ctx, name, x, y, align, color);
}

/** Draw character render images for one side. */
async function drawCharacterRenders(
  ctx: CanvasRenderingContext2D,
  chars: { characterId: number; colorId: number }[],
  side: 'left' | 'right',
) {
  if (chars.length === 0) return;

  const maxChars = Math.min(chars.length, 3);
  const areaX = side === 'left' ? 0 : WIDTH / 2;
  const areaW = WIDTH / 2;
  const areaH = HEIGHT;

  for (let i = 0; i < maxChars; i++) {
    const char = chars[i];
    try {
      // eslint-disable-next-line no-await-in-loop
      const dataUrl = await window.flippiThumbnail.getCharacterRender(
        char.characterId,
        char.colorId,
      );
      // eslint-disable-next-line no-await-in-loop
      const img = await loadImage(dataUrl);

      const isPrimary = i === 0;
      const scale = isPrimary
        ? Math.min((areaW * 0.85) / img.width, (areaH - 120) / img.height, 1.2)
        : Math.min((areaW * 0.5) / img.width, (areaH - 120) / img.height, 0.7);

      const drawW = img.width * scale;
      const drawH = img.height * scale;

      let drawX: number;
      let drawY: number;

      if (isPrimary) {
        drawX = areaX + (areaW - drawW) / 2;
        drawY = (areaH - drawH) / 2 + 20;
      } else {
        const offsetX = i === 1 ? -30 : 30;
        const offsetY = i === 1 ? -20 : 20;
        drawX = areaX + (areaW - drawW) / 2 + offsetX;
        drawY = (areaH - drawH) / 2 + 20 + offsetY;
      }

      if (side === 'right') {
        ctx.save();
        ctx.translate(WIDTH, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, WIDTH - drawX - drawW, drawY, drawW, drawH);
        ctx.restore();
      } else {
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      }
    } catch {
      // Character render failed to load — skip
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ThumbnailRenderParams {
  eventName: string;
  set: GameSet;
  games: GameEntry[];
  settings: EventThumbnailSettings;
  serverPort: number;
  serverToken: string;
}

/**
 * Render a tournament set thumbnail and return it as a PNG data URL.
 * All characters played across all games in the set are shown.
 */
export async function renderThumbnail(
  params: ThumbnailRenderParams,
): Promise<string> {
  const { eventName, set, games, settings, serverPort, serverToken } = params;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;

  // --- 1. Background ---
  if (settings.thumbnailCanvasPath) {
    try {
      const bgImg = await loadLocalImage(
        settings.thumbnailCanvasPath,
        serverPort,
        serverToken,
      );
      ctx.drawImage(bgImg, 0, 0, WIDTH, HEIGHT);
    } catch {
      drawSplitBackground(ctx, settings.leftBgColor, settings.rightBgColor);
    }
  } else {
    drawSplitBackground(ctx, settings.leftBgColor, settings.rightBgColor);
  }

  // --- Data extraction ---
  const sides = getSidePlayersAcrossGames(games, set.matchType);
  const leftChars = getUniqueCharacters(sides[0]);
  const rightChars = getUniqueCharacters(sides[1]);

  // --- 2. Character renders ---
  await drawCharacterRenders(ctx, leftChars, 'left');
  await drawCharacterRenders(ctx, rightChars, 'right');

  // --- 3. Semi-transparent overlay for text readability ---
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, WIDTH, 100);
  ctx.fillRect(0, HEIGHT - 90, WIDTH, 90);

  // --- 4. Event logo stamp (centered below VS area) ---
  if (settings.eventLogoStampPath) {
    try {
      const logo = await loadLocalImage(
        settings.eventLogoStampPath,
        serverPort,
        serverToken,
      );
      const maxLogoW = 200;
      const maxLogoH = 80;
      const scale = Math.min(maxLogoW / logo.width, maxLogoH / logo.height, 1);
      const logoW = logo.width * scale;
      const logoH = logo.height * scale;
      ctx.drawImage(logo, (WIDTH - logoW) / 2, HEIGHT / 2 + 50, logoW, logoH);
    } catch {
      // Logo failed to load — skip
    }
  }

  // --- 5. VS text ---
  ctx.font = `bold 80px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  drawTextWithShadow(
    ctx,
    'VS',
    WIDTH / 2,
    HEIGHT / 2,
    'center',
    settings.textColor,
  );

  // --- 6. Player names ---
  ctx.textBaseline = 'top';
  const maxNameWidth = 500;

  if (set.matchType === 'Doubles') {
    const leftUnique = deduplicatePlayers(sides[0]);
    const rightUnique = deduplicatePlayers(sides[1]);

    const leftNames = Array.from({ length: Math.min(leftUnique.length, 2) })
      .map((_, i) => {
        const oi = i;
        const override = set.playerOverrides.find((o) => o.side === oi);
        if (override?.name.trim()) return override.name.trim();
        const p = leftUnique[i];
        return p.displayName || p.nametag || p.connectCode || `Player ${i + 1}`;
      })
      .join(' & ');

    const rightNames = Array.from({ length: Math.min(rightUnique.length, 2) })
      .map((_, i) => {
        const oi = 2 + i;
        const override = set.playerOverrides.find((o) => o.side === oi);
        if (override?.name.trim()) return override.name.trim();
        const p = rightUnique[i];
        return (
          p.displayName || p.nametag || p.connectCode || `Player ${oi + 1}`
        );
      })
      .join(' & ');

    drawPlayerName(
      ctx,
      leftNames,
      40,
      20,
      'left',
      maxNameWidth,
      settings.textColor,
    );
    drawPlayerName(
      ctx,
      rightNames,
      WIDTH - 40,
      20,
      'right',
      maxNameWidth,
      settings.textColor,
    );
  } else {
    const flatPlayers = sides.map((s) => s[0]).filter(Boolean);
    const leftName = resolvePlayerName(0, set.playerOverrides, flatPlayers);
    const rightName = resolvePlayerName(1, set.playerOverrides, flatPlayers);

    drawPlayerName(
      ctx,
      leftName,
      40,
      20,
      'left',
      maxNameWidth,
      settings.textColor,
    );
    drawPlayerName(
      ctx,
      rightName,
      WIDTH - 40,
      20,
      'right',
      maxNameWidth,
      settings.textColor,
    );
  }

  // --- 7. Character name badges (below player names) ---
  ctx.textBaseline = 'top';
  const leftCharNames = leftChars
    .map((c) => getCharacterName(c.characterId))
    .join(' / ');
  const rightCharNames = rightChars
    .map((c) => getCharacterName(c.characterId))
    .join(' / ');

  if (leftCharNames) {
    const badgeSize = fitText(ctx, leftCharNames, maxNameWidth, 24, 16, false);
    ctx.font = `${badgeSize}px ${FONT_FAMILY}`;
    drawTextWithShadow(ctx, leftCharNames, 40, 72, 'left', settings.textColor);
  }
  if (rightCharNames) {
    const badgeSize = fitText(ctx, rightCharNames, maxNameWidth, 24, 16, false);
    ctx.font = `${badgeSize}px ${FONT_FAMILY}`;
    drawTextWithShadow(
      ctx,
      rightCharNames,
      WIDTH - 40,
      72,
      'right',
      settings.textColor,
    );
  }

  // --- 8. Tournament context (bottom) ---
  const context = formatContext(set);
  const matchLabel = `MELEE ${set.matchType.toUpperCase()}`;

  ctx.textBaseline = 'bottom';

  ctx.font = `bold 32px ${FONT_FAMILY}`;
  drawTextWithShadow(
    ctx,
    context,
    WIDTH / 2,
    HEIGHT - 48,
    'center',
    settings.textColor,
  );

  const bottomLine = `${matchLabel} | ${eventName}`;
  const bottomSize = fitText(ctx, bottomLine, WIDTH - 80, 24, 16, false);
  ctx.font = `${bottomSize}px ${FONT_FAMILY}`;
  drawTextWithShadow(
    ctx,
    bottomLine,
    WIDTH / 2,
    HEIGHT - 16,
    'center',
    settings.textColor,
  );

  return canvas.toDataURL('image/png');
}
