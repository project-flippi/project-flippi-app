// Unit tests for formatComboText — the pure string formatter used by
// comboTextService. We only test the formatter directly; generateComboText's
// SLP parsing path is exercised manually against real replays (see plan).
import { formatComboText } from '../main/services/comboTextService';

// Mock slippi-js so the fallback path in resolveMoveName doesn't pull in the
// native node bundle during jest runs. We return predictable names for any
// move ID that isn't covered by the ported character flair dict.
// (jest.mock calls are hoisted above imports at compile time.)
jest.mock('@slippi/slippi-js/node', () => ({
  moves: {
    getMoveName: (moveId: number) => `Move${moveId}`,
  },
}));

describe('formatComboText', () => {
  const base = {
    stageName: 'Final Destination',
    attackerName: 'Mang0',
    attackerCharName: 'Fox',
    defenderName: 'Hungrybox',
    defenderCharName: 'Jigglypuff',
    startPercent: 12,
    endPercent: 70,
    didKill: true,
  };

  it('formats a multi-move combo with sequence and finisher', () => {
    const text = formatComboText({
      ...base,
      moveIds: [18, 17, 11], // Blaster, Air Drill, Flip Kick (all Fox flair)
      openingType: 'neutral-win',
    });
    expect(text).toBe(
      "On Final Destination, Mang0's Fox punished Hungrybox's Jigglypuff. " +
        'Damage dealt: ~58%. ' +
        'Sequence: Blaster, Air Drill → Finisher: Flip Kick. ' +
        'Did KO: true. ' +
        'Opening: neutral-win.',
    );
  });

  it('omits the Sequence clause for a single-move punish', () => {
    const text = formatComboText({
      ...base,
      startPercent: 0,
      endPercent: 18,
      didKill: false,
      moveIds: [11], // Flip Kick
    });
    expect(text).toContain('Finisher: Flip Kick.');
    expect(text).not.toContain('Sequence:');
    expect(text).toContain('Did KO: false.');
  });

  it('rounds percent to the nearest whole number', () => {
    const text = formatComboText({
      ...base,
      startPercent: 11.7,
      endPercent: 42.4,
      moveIds: [11],
    });
    // 42.4 - 11.7 = 30.7 → round → 31
    expect(text).toContain('Damage dealt: ~31%.');
  });

  it('falls back to slippi-js move names for unknown IDs', () => {
    const text = formatComboText({
      ...base,
      attackerCharName: 'NotACharacter',
      moveIds: [999, 1000],
    });
    // Both IDs miss the flair dict AND the character; the mocked slippi-js
    // fallback returns "Move{id}".
    expect(text).toContain('Sequence: Move999 → Finisher: Move1000.');
  });

  it('omits the Opening clause when openingType is not provided', () => {
    const text = formatComboText({
      ...base,
      moveIds: [11],
    });
    expect(text).not.toContain('Opening:');
  });
});
