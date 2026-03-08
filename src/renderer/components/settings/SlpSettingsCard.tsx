type Props = {
  value: string;
  onChange: (next: string) => void;
};

function SlpSettingsCard({ value, onChange }: Props) {
  async function handleBrowse() {
    const result = await window.flippiDialog.selectFolder();
    if (result.ok && result.path) {
      onChange(result.path);
    }
  }

  return (
    <div className="pf-card">
      <h2>SLP Data</h2>

      <div className="pf-field">
        <label htmlFor="slp-data-folder">
          SLP Data Folder
          <div className="pf-settings-actions">
            <input
              id="slp-data-folder"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="C:\Users\you\Slippi"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="pf-button pf-button-primary"
              onClick={handleBrowse}
            >
              Browse
            </button>
          </div>
          <div className="pf-note">
            Path to the folder where Slippi stores .slp replay files.
          </div>
        </label>
      </div>
    </div>
  );
}

export default SlpSettingsCard;
