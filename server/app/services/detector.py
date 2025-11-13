"""
YOLO-based object detection service.

This module encapsulates the heavy lifting for video frame extraction and object
inference so that it can be re-used by both the FastAPI endpoint and local CLI
scripts.
"""

from __future__ import annotations

import base64
import logging
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import cv2
import numpy as np
from ultralytics import YOLO

try:  # Torch 2.6+ safe loading support
    from torch.serialization import add_safe_globals
except ImportError:  # pragma: no cover - older torch versions
    add_safe_globals = None  # type: ignore[assignment]

try:
    from ultralytics.nn.tasks import DetectionModel
except ImportError:  # pragma: no cover - defensive
    DetectionModel = None  # type: ignore[assignment]

if add_safe_globals and DetectionModel:
    try:
        add_safe_globals([DetectionModel])
    except Exception:  # pragma: no cover - guard against API differences
        logging.getLogger(__name__).warning(
            "Failed to register DetectionModel with torch.safe_globals"
        )

from ..config import settings

logger = logging.getLogger(__name__)


@dataclass
class Detection:
    """Represents a single YOLO detection for a frame."""

    class_name: str
    confidence: float
    bbox: List[float]

    def to_dict(self) -> Dict[str, float | str | List[float]]:
        return {
            "class": self.class_name,
            "confidence": self.confidence,
            "bbox": self.bbox,
        }


@dataclass
class FrameDetections:
    """Stores detections for a single sampled frame."""

    timestamp: float
    frame_index: int
    objects: List[Detection]
    image_b64: Optional[str] = None

    def to_dict(self) -> Dict[str, object]:
        payload: Dict[str, object] = {
            "timestamp": self.timestamp,
            "frame_index": self.frame_index,
            "objects": [obj.to_dict() for obj in self.objects],
        }
        if self.image_b64 is not None:
            payload["image"] = self.image_b64
        return payload


class DetectionService:
    """
    Loads a YOLO model and performs inference on sampled frames from a video.
    """

    def __init__(self, model_path: str | Path, default_min_conf: float) -> None:
        model_path = Path(model_path)
        if not model_path.exists():
            raise FileNotFoundError(
                f"YOLO model weights not found at '{model_path.resolve()}'"
            )

        logger.info("Loading YOLO model from %s", model_path)
        self.model = YOLO(str(model_path))
        self.default_min_conf = default_min_conf

    def process_video(
        self,
        video_path: str | Path,
        frame_interval_seconds: float,
        min_confidence: Optional[float] = None,
        target_object: Optional[str] = None,
        max_frames: Optional[int] = None,
    ) -> Dict[str, object]:
        """
        Run inference on the provided video file.

        Args:
            video_path: Path to the video file.
            frame_interval_seconds: Seconds between sampled frames.
            min_confidence: Minimum confidence for detections (overrides default).
            target_object: Optional class name to filter detections of interest.
            max_frames: Optional cap on the number of frames to process.

        Returns:
            Dictionary containing detections, summary metadata, and target hits.
        """
        video_path = Path(video_path)
        if not video_path.exists():
            raise FileNotFoundError(f"Video file not found at {video_path}")

        confidence_threshold = (
            min_confidence if min_confidence is not None else self.default_min_conf
        )

        logger.info(
            "Processing video '%s' (frame_interval=%.2fs, min_conf=%.2f, target=%s)",
            video_path.name,
            frame_interval_seconds,
            confidence_threshold,
            target_object or "*",
        )

        capture = cv2.VideoCapture(str(video_path))
        if not capture.isOpened():
            raise RuntimeError(f"Unable to open video file: {video_path}")

        fps = capture.get(cv2.CAP_PROP_FPS) or 0.0
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
        duration = total_frames / fps if fps else 0.0

        if frame_interval_seconds <= 0:
            raise ValueError("frame_interval_seconds must be greater than 0")

        if fps <= 0:
            # Fallback to 30 fps if metadata missing
            fps = 30.0

        frame_step = max(int(math.ceil(frame_interval_seconds * fps)), 1)

        detections: List[FrameDetections] = []
        target_hits: List[Dict[str, object]] = []

        frame_index = 0
        processed_frames = 0

        try:
            while True:
                ret, frame = capture.read()
                if not ret:
                    break

                if frame_index % frame_step != 0:
                    frame_index += 1
                    continue

                processed_frames += 1
                timestamp_seconds = frame_index / fps

                frame_detections = self._infer_frame(
                    frame,
                    confidence_threshold,
                    timestamp_seconds,
                    frame_index,
                )

                if frame_detections.objects:
                    detections.append(frame_detections)

                    if target_object:
                        matches = [
                            obj.to_dict()
                            for obj in frame_detections.objects
                            if obj.class_name.lower() == target_object.lower()
                        ]
                        if matches:
                            target_hits.append(
                                {
                                    "timestamp": frame_detections.timestamp,
                                    "timestamp_formatted": self._format_timestamp(
                                        frame_detections.timestamp
                                    ),
                                    "image": frame_detections.image_b64,
                                    "objects": matches,
                                }
                            )

                if max_frames and processed_frames >= max_frames:
                    logger.info(
                        "Max frames limit reached (%d); stopping processing", max_frames
                    )
                    break

                frame_index += 1

        finally:
            capture.release()

        summary = {
            "fps": fps,
            "duration_seconds": duration,
            "total_frames": total_frames,
            "processed_frames": processed_frames,
            "frame_interval_seconds": frame_interval_seconds,
            "confidence_threshold": confidence_threshold,
            "target_object": target_object,
            "detections_found": len(detections),
            "target_hits": len(target_hits),
        }

        logger.info(
            "Detection complete: %d frames processed, %d detections, %d target hits",
            processed_frames,
            len(detections),
            len(target_hits),
        )

        return {
            "results": [det.to_dict() for det in detections],
            "target_hits": target_hits,
            "summary": summary,
        }

    def _infer_frame(
        self,
        frame: np.ndarray,
        min_confidence: float,
        timestamp: float,
        frame_index: int,
    ) -> FrameDetections:
        result = self.model(frame, verbose=False)
        frame_result = result[0]
        names = frame_result.names

        objects: List[Detection] = []

        if frame_result.boxes is not None and frame_result.boxes.cls is not None:
            for idx, cls_tensor in enumerate(frame_result.boxes.cls):
                confidence = float(frame_result.boxes.conf[idx].item())
                if confidence < min_confidence:
                    continue

                cls_id = int(cls_tensor.item())
                class_name = names.get(cls_id, str(cls_id))
                bbox = frame_result.boxes.xyxy[idx].tolist()
                objects.append(
                    Detection(
                        class_name=class_name,
                        confidence=confidence,
                        bbox=[float(coord) for coord in bbox],
                    )
                )

        image_b64: Optional[str] = None
        if objects:
            success, buffer = cv2.imencode(".jpg", frame)
            if success:
                image_b64 = base64.b64encode(buffer).decode("utf-8")

        return FrameDetections(
            timestamp=timestamp,
            frame_index=frame_index,
            objects=objects,
            image_b64=image_b64,
        )

    @staticmethod
    def _format_timestamp(seconds: float) -> str:
        mins = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{mins:02d}:{secs:02d}"


detector_service = DetectionService(
    model_path=settings.model_path,
    default_min_conf=settings.min_confidence,
)


