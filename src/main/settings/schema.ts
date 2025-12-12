export type TextAiProvider = 'openai' | 'gemini' | 'claude';
export type ImageAiProvider = 'openai' | 'gemini';

export interface YoutubeSettings {
  clientId: string;
  projectId: string;
  clientSecret: string;
  // We’ll hard-code the URIs in code – not stored here
}

export interface ObsSettings {
  host: string;   // default "127.0.0.1"
  port: string;   // default "4444"
  password: string;
}

export interface TextAiSettings {
  provider: TextAiProvider; // default "openai"
  apiKey: string;
}

export interface ImageAiSettings {
  provider: ImageAiProvider; // default "openai"
  apiKey: string;
}

export interface AppSettings {
  version: 1; // simple version tag for future migrations
  youtube: YoutubeSettings;
  obs: ObsSettings;
  textAi: TextAiSettings;
  imageAi: ImageAiSettings;
}

// Default values if the user hasn't set anything yet
export const defaultSettings: AppSettings = {
  version: 1,
  youtube: {
    clientId: '',
    projectId: '',
    clientSecret: '',
  },
  obs: {
    host: '127.0.0.1',
    port: '4444',
    password: '',
  },
  textAi: {
    provider: 'openai',
    apiKey: '',
  },
  imageAi: {
    provider: 'openai',
    apiKey: '',
  },
};
