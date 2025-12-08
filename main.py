from __future__ import annotations
import argparse
import json
from pathlib import Path
from backend.app.services.detector import detector_service

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run YOLO object detection on a video.")
    parser.add_argument(
        "--video",
        type=Path,
        required=True,
        help="Path to the input video file.",
    )
    parser.add_argument(
        "--target",
        type=str,
        default=None,
        help="Optional specific object class to highlight (case-insensitive).",
    )
    parser.add_argument(
        "--frame-interval",
        type=float,
        default=1.0,
        help="Seconds between sampled frames during inference.",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.3,
        help="Minimum confidence threshold for detections.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional path to write the detections JSON output.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    result = detector_service.process_video(
        video_path=args.video,
        frame_interval_seconds=args.frame_interval,
        min_confidence=args.min_confidence,
        target_object=args.target,
    )

    summary = result["summary"]

    print(
        f"Processed video '{args.video}': "
        f"{summary['processed_frames']} frames sampled, "
        f"{summary['detections_found']} frames with detections, "
        f"{summary['target_hits']} target hits"
    )

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2))
        print(f"Detection results written to {args.output}")
    else:
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
