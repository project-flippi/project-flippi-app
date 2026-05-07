export type TextAiProvider = 'openai' | 'gemini' | 'claude';
export type ImageAiProvider = 'openai' | 'gemini';

export interface YoutubeSettings {
  clientId: string;
  projectId: string;
  clientSecret: string;
  // We’ll hard-code the URIs in code – not stored here
}

export interface ObsSettings {
  host: string; // default "127.0.0.1"
  port: string; // default "4455"
  password: string;
  gameCaptureSource: string; // OBS source name to monitor for game capture
  playerCameraSource: string; // OBS source name for player camera
  enableReplayBuffer: boolean; // start replay buffer when stack starts
  startRecording: boolean; // start recording when stack starts
  startStreaming: boolean; // start streaming when stack starts
}

export interface TextAiPromptConfig {
  systemPrompt: string;
  userPrompt: string; // template; supports {eventName} {comboText} (+ {title} for description)
  maxTokens: number;
  temperature: number;
}

export interface TextAiSettings {
  provider: TextAiProvider; // default "openai"
  apiKey: string;
  model: string; // free-text model ID; empty = provider default
  titleConfig: TextAiPromptConfig;
  descriptionConfig: TextAiPromptConfig;
  compilationTitleConfig: TextAiPromptConfig;
  compilationDescriptionConfig: TextAiPromptConfig;
}

export interface ImageAiSettings {
  provider: ImageAiProvider; // default "openai"
  apiKey: string;
}

export interface AppSettings {
  version: 1; // simple version tag for future migrations
  alwaysOnTop: boolean;
  closeObsOnStop: boolean;
  closeClippiOnStop: boolean;
  closeSlippiOnStop: boolean;
  slpDataFolder: string; // path to SLP replay data folder
  youtube: YoutubeSettings;
  obs: ObsSettings;
  textAi: TextAiSettings;
  imageAi: ImageAiSettings;
}

// Default values if the user hasn't set anything yet
export const defaultSettings: AppSettings = {
  version: 1,
  alwaysOnTop: false,
  closeObsOnStop: true,
  closeClippiOnStop: true,
  closeSlippiOnStop: true,
  slpDataFolder: '',
  youtube: {
    clientId: '',
    projectId: '',
    clientSecret: '',
  },
  obs: {
    host: '127.0.0.1',
    port: '4455',
    password: '',
    gameCaptureSource: '',
    playerCameraSource: '',
    enableReplayBuffer: true,
    startRecording: false,
    startStreaming: false,
  },
  textAi: {
    provider: 'openai',
    apiKey: '',
    model: '',
    titleConfig: {
      systemPrompt:
        'You are a creative title writer for Super Smash Bros. Melee combo clips on YouTube. Generate a short, catchy, exciting title (max 60 characters). Do not use quotes. Make it hype and engaging for the Melee community.',
      userPrompt:
        'Write a title for a Super Smash Bros. Melee combo clip from {eventName}. Combo: {comboText}',
      maxTokens: 200,
      temperature: 0.8,
    },
    descriptionConfig: {
      systemPrompt:
        'You are a YouTube SEO expert for Super Smash Bros. Melee content. Write a short, engaging description (2-3 sentences) with relevant keywords. Include hashtags. Do not use quotes around the description.',
      userPrompt:
        'Write a description for a Super Smash Bros. Melee combo clip titled "{title}" from {eventName}. Combo: {comboText}',
      maxTokens: 200,
      temperature: 0.8,
    },
    compilationTitleConfig: {
      systemPrompt:
        'You are a creative title writer for compilations of Super Smash Bros. Melee combo clips on YouTube. Generate a short, fun title (max 60 characters). Do not use quotes. Make it hype and engaging for the Melee community.',
      userPrompt:
        'Write a title for a compilation of clips from {eventName}.\nClip titles:\n{clipTitles}\n\nCombo details:\n{comboTexts}',
      maxTokens: 200,
      temperature: 0.9,
    },
    compilationDescriptionConfig: {
      systemPrompt:
        'You are a YouTube SEO expert for Super Smash Bros. Melee content. Write a short, engaging description (2-3 sentences) for a compilation video, with relevant keywords. Include hashtags. Do not use quotes around the description.',
      userPrompt:
        'Write a description for a Super Smash Bros. Melee combo compilation titled "{title}" from {eventName}.\nClip titles:\n{clipTitles}\n\nCombo details:\n{comboTexts}',
      maxTokens: 300,
      temperature: 0.8,
    },
  },
  imageAi: {
    provider: 'openai',
    apiKey: '',
  },
};
