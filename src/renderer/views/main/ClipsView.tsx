import type {
  VideoDataEntry,
  CompilationEntry,
} from '../../../common/meleeTypes';
import ClipCard from '../../components/video/ClipCard';

type Props = {
  clips: VideoDataEntry[];
  compilations: CompilationEntry[];
  eventName: string;
  onUpdated: () => void;
};

function ClipsView({ clips, compilations, eventName, onUpdated }: Props) {
  if (clips.length === 0) {
    return (
      <div className="pf-status-message" style={{ marginTop: 12 }}>
        No clips found. Use &quot;Create Clip Data&quot; to process combo data.
      </div>
    );
  }

  return (
    <div className="pf-clips-list">
      {clips.map((clip) => (
        <ClipCard
          key={clip.timestamp}
          clip={clip}
          compilations={compilations}
          eventName={eventName}
          onUpdated={onUpdated}
        />
      ))}
    </div>
  );
}

export default ClipsView;
