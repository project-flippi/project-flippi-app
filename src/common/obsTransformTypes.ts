// Shared types for OBS source transform data

export interface SourceTransform {
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  alignment: number;
  boundsType: string;
  boundsWidth: number;
  boundsHeight: number;
  boundsAlignment: number;
  cropToBounds: boolean;
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
}

export interface RecordingTransforms {
  gameCaptureSource: string;
  gameCaptureTransform: SourceTransform | null;
  playerCameraSource: string;
  playerCameraTransform: SourceTransform | null;
  sceneName: string;
  capturedAt: string;
}
