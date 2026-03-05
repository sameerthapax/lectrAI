import type { VisionDetectionPayload } from '@park-u/shared-types';

export const VISION_PROTOCOL_VERSION = 'v1';

export interface VisionEnvelope {
  version: string;
  topic: string;
  payload: VisionDetectionPayload;
}

export function createVisionEnvelope(
  payload: VisionDetectionPayload,
): VisionEnvelope {
  return {
    version: VISION_PROTOCOL_VERSION,
    topic: 'parking.vision.detection',
    payload,
  };
}
