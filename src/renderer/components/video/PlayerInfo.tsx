type Props = {
  playerRole: 'Attacker' | 'Defender';
  characterName: string;
  characterColor: number | null;
  nametag: string;
  connectCode: string;
  displayName: string;
};

function PlayerInfo({
  playerRole,
  characterName,
  characterColor,
  nametag,
  connectCode,
  displayName,
}: Props) {
  const tag = displayName || connectCode || nametag || 'Unknown';
  const colorStr =
    characterColor !== null && characterColor !== undefined
      ? ` (C${characterColor})`
      : '';

  return (
    <div className="pf-player-info">
      <span className="pf-player-role">{playerRole}</span>
      <span className="pf-player-character">
        {characterName}
        {colorStr}
      </span>
      <span className="pf-player-tag">{tag}</span>
    </div>
  );
}

export default PlayerInfo;
