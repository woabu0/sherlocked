// types/index.ts
export interface Detection {
  class: string;
  confidence: number;
  bbox: number[];
  color?: string;
  color_rgb?: number[];
}

export interface DetectionResult {
  timestamp: number;
  frame_index: number;
  image?: string;
  objects: Detection[];
}

export interface TargetHit {
  timestamp: number;
  timestamp_formatted: string;
  image?: string;
  objects: Detection[];
}

export interface DetectionSummary {
  fps: number;
  duration_seconds: number;
  total_frames: number;
  processed_frames: number;
  frame_interval_seconds: number;
  confidence_threshold: number;
  target_object?: string | null;
  detections_found: number;
  target_hits: number;
}

export interface ProcessVideoResponse {
  success: boolean;
  results: DetectionResult[];
  target_hits: TargetHit[];
  summary: DetectionSummary;
  error?: string;
}
