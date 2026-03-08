import type { CompilationEntry } from '../../../common/meleeTypes';
import CompilationCard from '../../components/video/CompilationCard';
import CompilationFilterPanel from '../../components/video/CompilationFilterPanel';

type Props = {
  compilations: CompilationEntry[];
  eventName: string;
  onUpdated: () => void;
};

function CompilationsView({ compilations, eventName, onUpdated }: Props) {
  return (
    <div>
      <CompilationFilterPanel eventName={eventName} onCreated={onUpdated} />

      {compilations.length === 0 ? (
        <div className="pf-status-message" style={{ marginTop: 12 }}>
          No compilations yet. Use the panel above to create one.
        </div>
      ) : (
        <div className="pf-compilations-list">
          {compilations.map((comp) => (
            <CompilationCard
              key={comp.filePath}
              compilation={comp}
              eventName={eventName}
              onUpdated={onUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default CompilationsView;
