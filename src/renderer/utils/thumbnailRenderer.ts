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

const WIDTH = 1280;
const HEIGHT = 720;

const FONT_FAMILY = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

// ---------------------------------------------------------------------------
// Helper functions (defined before main export to satisfy no-use-before-define)
// ---------------------------------------------------------------------------

/** Unique characters played by a side, ordered by first appearance. */
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

  return [...counts.keys()]
    .sort((a, b) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0))
    .map((charId) => ({
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

/** Result from building diagonal regions: clip polygons + boundary lines. */
interface RegionResult {
  regions: { x: number; y: number }[][];
  diagonals: { from: { x: number; y: number }; to: { x: number; y: number } }[];
}

/**
 * Build triangular clip regions for N characters within a rectangular area.
 * Regions are ordered by size (largest first = first character played).
 * Also returns diagonal line segments to draw as boundaries.
 */
function buildDiagonalRegions(
  n: number,
  areaX: number,
  areaY: number,
  areaW: number,
  areaH: number,
): RegionResult {
  const TL = { x: areaX, y: areaY };
  const TR = { x: areaX + areaW, y: areaY };
  const BR = { x: areaX + areaW, y: areaY + areaH };
  const BL = { x: areaX, y: areaY + areaH };
  const C = { x: areaX + areaW / 2, y: areaY + areaH / 2 };
  const BC = { x: areaX + areaW / 2, y: areaY + areaH };

  switch (Math.min(n, 5)) {
    case 2:
      return {
        regions: [
          [BL, TR, BR], // bottom-right (largest)
          [BL, TL, TR], // top-left
        ],
        diagonals: [{ from: BL, to: TR }],
      };
    case 3:
      return {
        regions: [
          [BL, TR, BR], // bottom-right (largest)
          [TL, TR, C], // top
          [TL, C, BL], // left
        ],
        diagonals: [
          { from: BL, to: TR },
          { from: TL, to: C },
        ],
      };
    case 4:
      return {
        regions: [
          [TR, BR, C], // right
          [BR, BL, C], // bottom
          [TL, TR, C], // top
          [BL, TL, C], // left
        ],
        diagonals: [
          { from: BL, to: TR },
          { from: TL, to: BR },
        ],
      };
    case 5:
      return {
        regions: [
          [TR, BR, C], // right
          [BR, BC, C], // bottom-right
          [TL, TR, C], // top
          [BL, TL, C], // left
          [BC, BL, C], // bottom-left
        ],
        diagonals: [
          { from: BL, to: TR },
          { from: TL, to: BR },
          { from: BC, to: C },
        ],
      };
    default:
      // N=1 or 0: full rectangle
      return {
        regions: [[TL, TR, BR, BL]],
        diagonals: [],
      };
  }
}

/** Mirror region polygons and diagonals horizontally within an area. */
function mirrorRegions(
  result: RegionResult,
  areaX: number,
  areaW: number,
): RegionResult {
  const mx = (x: number) => 2 * areaX + areaW - x;
  const mp = (p: { x: number; y: number }) => ({ x: mx(p.x), y: p.y });
  return {
    regions: result.regions.map((poly) => poly.map(mp)),
    diagonals: result.diagonals.map((d) => ({
      from: mp(d.from),
      to: mp(d.to),
    })),
  };
}

/** Compute the centroid of a polygon for centering an image within it. */
function polygonCenter(points: { x: number; y: number }[]): {
  x: number;
  y: number;
} {
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    cx += points[i].x;
    cy += points[i].y;
  }
  return { x: cx / points.length, y: cy / points.length };
}

/** Draw character render images for one side with diagonal clipping. */
async function drawCharacterRenders(
  ctx: CanvasRenderingContext2D,
  chars: { characterId: number; colorId: number }[],
  side: 'left' | 'right',
) {
  if (chars.length === 0) return;

  const maxChars = Math.min(chars.length, 5);
  const areaX = side === 'left' ? 0 : WIDTH / 2;
  const areaW = WIDTH / 2;
  const areaH = HEIGHT;

  let result = buildDiagonalRegions(maxChars, areaX, 0, areaW, areaH);
  if (side === 'right') {
    result = mirrorRegions(result, areaX, areaW);
  }

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

      const region = result.regions[i];
      const center = polygonCenter(region);

      // Scale character to full-half size (same as single char); clipping handles overflow
      const padFactor = 0.85;
      const scale = Math.min(
        (areaW * padFactor) / img.width,
        (areaH * padFactor) / img.height,
        1.2,
      );

      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = center.x - drawW / 2;
      const drawY = center.y - drawH / 2;

      ctx.save();

      // Apply clip region
      if (maxChars > 1) {
        ctx.beginPath();
        ctx.moveTo(region[0].x, region[0].y);
        for (let j = 1; j < region.length; j++) {
          ctx.lineTo(region[j].x, region[j].y);
        }
        ctx.closePath();
        ctx.clip();
      }

      // Flip right-side characters horizontally so they face inward
      if (side === 'right') {
        ctx.translate(WIDTH, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, WIDTH - drawX - drawW, drawY, drawW, drawH);
      } else {
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      }

      ctx.restore();
    } catch {
      // Character render failed to load — skip
    }
  }

  // Draw diagonal boundary lines on top of all character renders
  if (result.diagonals.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let d = 0; d < result.diagonals.length; d++) {
      const diag = result.diagonals[d];
      ctx.beginPath();
      ctx.moveTo(diag.from.x, diag.from.y);
      ctx.lineTo(diag.to.x, diag.to.y);
      ctx.stroke();
    }
    ctx.restore();
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
  const { set, games, settings, serverPort, serverToken } = params;

  console.log('[thumbnail] Rendering with settings:', {
    eventLogoStampPath: settings.eventLogoStampPath,
    thumbnailCanvasPath: settings.thumbnailCanvasPath,
    textColor: settings.textColor,
    serverPort,
  });

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
    } catch (err) {
      console.error('[thumbnail] Failed to load canvas image:', err);
      drawSplitBackground(ctx, settings.leftBgColor, settings.rightBgColor);
    }
  } else {
    drawSplitBackground(ctx, settings.leftBgColor, settings.rightBgColor);
  }

  // --- Data extraction ---
  const sides = getSidePlayersAcrossGames(games, set.matchType);
  const leftChars = getUniqueCharacters(sides[0]);
  const rightChars = getUniqueCharacters(sides[1]);

  // --- 2. Character renders (with diagonal clipping for multi-char) ---
  await drawCharacterRenders(ctx, leftChars, 'left');
  await drawCharacterRenders(ctx, rightChars, 'right');

  // --- 3. Semi-transparent overlay for text readability ---
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, WIDTH, 100);
  ctx.fillRect(0, HEIGHT - 90, WIDTH, 90);

  // --- 4. Event logo stamp (scaled to fill space between VS and bottom bar) ---
  if (settings.eventLogoStampPath) {
    try {
      const logo = await loadLocalImage(
        settings.eventLogoStampPath,
        serverPort,
        serverToken,
      );
      const logoZoneTop = HEIGHT / 2 + 50; // 10px below VS bottom
      const logoZoneBottom = HEIGHT - 90 - 10; // 10px above bottom bar
      const maxLogoH = logoZoneBottom - logoZoneTop;
      const maxLogoW = WIDTH * 0.4;
      const scale = Math.min(maxLogoW / logo.width, maxLogoH / logo.height);
      const logoW = logo.width * scale;
      const logoH = logo.height * scale;
      // Center within the logo zone
      const logoX = (WIDTH - logoW) / 2;
      const logoY = logoZoneTop + (maxLogoH - logoH) / 2;
      ctx.drawImage(logo, logoX, logoY, logoW, logoH);
    } catch (err) {
      console.error('[thumbnail] Failed to load logo image:', err);
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

  // --- 6. Player names (vertically centered in top bar) ---
  ctx.textBaseline = 'middle';
  const maxNameWidth = 500;
  const topBarCenterY = 50; // center of the 100px top overlay

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
      .join(' & ')
      .toUpperCase();

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
      .join(' & ')
      .toUpperCase();

    drawPlayerName(
      ctx,
      leftNames,
      WIDTH / 4,
      topBarCenterY,
      'center',
      maxNameWidth,
      settings.textColor,
    );
    drawPlayerName(
      ctx,
      rightNames,
      (WIDTH * 3) / 4,
      topBarCenterY,
      'center',
      maxNameWidth,
      settings.textColor,
    );
  } else {
    const flatPlayers = sides.map((s) => s[0]).filter(Boolean);
    const leftName = resolvePlayerName(
      0,
      set.playerOverrides,
      flatPlayers,
    ).toUpperCase();
    const rightName = resolvePlayerName(
      1,
      set.playerOverrides,
      flatPlayers,
    ).toUpperCase();

    drawPlayerName(
      ctx,
      leftName,
      WIDTH / 4,
      topBarCenterY,
      'center',
      maxNameWidth,
      settings.textColor,
    );
    drawPlayerName(
      ctx,
      rightName,
      (WIDTH * 3) / 4,
      topBarCenterY,
      'center',
      maxNameWidth,
      settings.textColor,
    );
  }

  // --- 7. Bottom bar: context (left half) + match type (right half) ---
  const context = formatContext(set).toUpperCase();
  const matchLabel = `MELEE ${set.matchType.toUpperCase()}`;

  ctx.textBaseline = 'middle';
  const bottomBarCenterY = HEIGHT - 45; // center of the 90px bottom overlay

  // Left half: Phase/Round (tournament) or set type (friendlies/ranked/unranked)
  const ctxSize = fitText(ctx, context, WIDTH / 2 - 60, 48, 28, true);
  ctx.font = `bold ${ctxSize}px ${FONT_FAMILY}`;
  drawTextWithShadow(
    ctx,
    context,
    WIDTH / 4,
    bottomBarCenterY,
    'center',
    settings.textColor,
  );

  // Right half: Match type (MELEE SINGLES / MELEE DOUBLES)
  const matchSize = fitText(ctx, matchLabel, WIDTH / 2 - 60, 48, 28, true);
  ctx.font = `bold ${matchSize}px ${FONT_FAMILY}`;
  drawTextWithShadow(
    ctx,
    matchLabel,
    (WIDTH * 3) / 4,
    bottomBarCenterY,
    'center',
    settings.textColor,
  );

  return canvas.toDataURL('image/png');
}
