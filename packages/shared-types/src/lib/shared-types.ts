export type LectrAIEnvironment = 'dev' | 'prod';

export interface VisionDetectionPayload {
  lotId: string;
  spotId: string;
  occupied: boolean;
  confidence: number;
  capturedAtIso: string;
}
