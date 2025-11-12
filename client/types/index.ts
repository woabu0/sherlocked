// types/index.ts
export interface Detection {
  class: string;
  confidence: number;
  bbox: number[];
}

export interface DetectionResult {
  timestamp: number;
  objects: Detection[];
}

export interface ProcessVideoResponse {
  success: boolean;
  results: DetectionResult[];
  error?: string;
}
