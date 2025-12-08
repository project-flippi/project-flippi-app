import React, { useState } from 'react';

type TextAiProvider = 'openai' | 'gemini' | 'claude';
type ImageAiProvider = 'openai' | 'gemini';

interface YoutubeSettings {
  clientId: string;
  projectId: string;
  clientSecret: string;
}

interface ObsSettings {
  host: string;
  port: string;
  password: string;
}

interface TextAiSettings {
  provider: TextAiProvider;
  apiKey: string;
}

interface ImageAiSettings {
  provider: ImageAiProvider;
  apiKey: string;
}

const SettingsPanel: React.FC = () => {
  // --- Local state (later you can hydrate from / persist to disk via Electron) ---
  const [youtube, setYoutube] = useState<YoutubeSettings>({
    clientId: '',
    projectId: '',
    clientSecret: '',
  });

  const [obs, setObs] = useState<ObsSettings>({
    host: '127.0.0.1',
    port: '4444',
    password: '',
  });

  const [textAi, setTextAi] = useState<TextAiSettings>({
    provider: 'openai',
    apiKey: '',
  });

  const [imageAi, setImageAi] = useState<ImageAiSettings>({
    provider: 'openai',
    apiKey: '',
  });

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSave = () => {
    // TODO: replace with IPC call to persist settings (e.g. electron-store)
    console.log('Saving settings:', { youtube, obs, textAi, imageAi });
    setStatusMessage('Settings saved (placeholder). Persistence not wired yet.');
    setTimeout(() => setStatusMessage(null), 4000);
  };

  return (
    <section className="pf-section pf-settings">
      <h1>Settings</h1>
      <p className="pf-section-description">
        Configure your YouTube connection, OBS, and AI providers for text and image generation.
      </p>

      <div className="pf-settings-grid">
        {/* YouTube Section */}
        <div className="pf-card">
          <div className="pf-card-header">
            <h2>YouTube API Client</h2>
            <p>Stored as a client_secrets-style config. Fixed auth URLs are handled internally.</p>
          </div>

          <div className="pf-field">
            <label>Client ID</label>
            <input
              type="text"
              value={youtube.clientId}
              onChange={(e) => setYoutube({ ...youtube, clientId: e.target.value })}
              placeholder="e.g. 1234567890-abc123.apps.googleusercontent.com"
            />
          </div>

          <div className="pf-field">
            <label>Project ID</label>
            <input
              type="text"
              value={youtube.projectId}
              onChange={(e) => setYoutube({ ...youtube, projectId: e.target.value })}
              placeholder="e.g. project-flippi-youtube"
            />
          </div>

          <div className="pf-field">
            <label>Client Secret</label>
            <input
              type="password"
              value={youtube.clientSecret}
              onChange={(e) => setYoutube({ ...youtube, clientSecret: e.target.value })}
              placeholder="••••••••••••••••"
            />
          </div>

          <div className="pf-note">
            The following values are treated as constants in the app:
            <ul>
              <li><code>auth_uri</code>: https://accounts.google.com/o/oauth2/auth</li>
              <li><code>token_uri</code>: https://oauth2.googleapis.com/token</li>
              <li><code>auth_provider_x509_cert_url</code>: https://www.googleapis.com/oauth2/v1/certs</li>
              <li><code>redirect_uris</code>: [ &quot;http://localhost&quot; ]</li>
            </ul>
          </div>
        </div>

        {/* OBS Section */}
        <div className="pf-card">
          <div className="pf-card-header">
            <h2>OBS Connection</h2>
            <p>Used to start OBS, automatically set recording paths based on event, and start instant replay buffer.</p>
          </div>

          <div className="pf-field">
            <label>OBS Host</label>
            <input
              type="text"
              value={obs.host}
              onChange={(e) => setObs({ ...obs, host: e.target.value })}
              placeholder="127.0.0.1"
            />
          </div>

          <div className="pf-field">
            <label>OBS Port</label>
            <input
              type="text"
              value={obs.port}
              onChange={(e) => setObs({ ...obs, port: e.target.value })}
              placeholder="4444"
            />
          </div>

          <div className="pf-field">
            <label>OBS Password</label>
            <input
              type="password"
              value={obs.password}
              onChange={(e) => setObs({ ...obs, password: e.target.value })}
              placeholder="••••••••••"
            />
          </div>
        </div>

        {/* Text Generation AI Section */}
        <div className="pf-card">
          <div className="pf-card-header">
            <h2>Text Generation AI (optional)</h2>
            <p>Select provider and API key for titles, descriptions, and other text prompts.</p>
          </div>

          <div className="pf-field">
            <label>Provider</label>
            <select
              value={textAi.provider}
              onChange={(e) =>
                setTextAi({ ...textAi, provider: e.target.value as TextAiProvider })
              }
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
          </div>

          <div className="pf-field">
            <label>API Key</label>
            <input
              type="password"
              value={textAi.apiKey}
              onChange={(e) => setTextAi({ ...textAi, apiKey: e.target.value })}
              placeholder="sk-... / gemini-... / claude-..."
            />
          </div>
        </div>

        {/* Image Generation AI Section */}
        <div className="pf-card">
          <div className="pf-card-header">
            <h2>Image Generation AI (optional)</h2>
            <p>Used for thumbnails or other image assets.</p>
          </div>

          <div className="pf-field">
            <label>Provider</label>
            <select
              value={imageAi.provider}
              onChange={(e) =>
                setImageAi({ ...imageAi, provider: e.target.value as ImageAiProvider })
              }
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
            </select>
          </div>

          <div className="pf-field">
            <label>API Key</label>
            <input
              type="password"
              value={imageAi.apiKey}
              onChange={(e) => setImageAi({ ...imageAi, apiKey: e.target.value })}
              placeholder="sk-... / gemini-..."
            />
          </div>
        </div>
      </div>

      <div className="pf-settings-actions">
        <button className="pf-button pf-button-primary" onClick={handleSave}>
          Save Settings
        </button>
        {/* You can add a "Reset" later if you want */}
        {statusMessage && <span className="pf-status-message">{statusMessage}</span>}
      </div>
    </section>
  );
};

export default SettingsPanel;