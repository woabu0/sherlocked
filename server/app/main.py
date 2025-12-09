from __future__ import annotations
import json
import logging
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import List, Optional
import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from .config import settings
from .services.detector import detector_service

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Sherlocked Object Detection API",
    description="Upload video footage and detect objects using YOLO.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    """Simple health endpoint for monitoring."""
    return {"status": "ok"}


@app.post("/api/process-video")
async def process_video(
    file: UploadFile = File(...),
    target_object: Optional[str] = Form(default=None),
    frame_interval_seconds: float = Form(default=settings.frame_interval_seconds),
    min_confidence: float = Form(default=settings.min_confidence),
) -> JSONResponse:
    """
    Receive an uploaded video, run YOLO inference, and return detection results.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    if file.content_type and not file.content_type.startswith("video/"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported content type '{file.content_type}'. Expected a video file.",
        )

    suffix = Path(file.filename).suffix or ".mp4"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        try:
            await _copy_upload_to_disk(file, tmp_file.name)

            logger.info(
                "Saved uploaded video to '%s' (target=%s, interval=%.2f, min_conf=%.2f)",
                tmp_file.name,
                target_object or "*",
                frame_interval_seconds,
                min_confidence,
            )

            detection_result = await run_in_threadpool(
                detector_service.process_video,
                tmp_file.name,
                frame_interval_seconds,
                min_confidence,
                target_object,
            )

            return JSONResponse(
                {
                    "success": True,
                    **detection_result,
                }
            )
        except ValueError as exc:
            logger.exception("Invalid request: %s", exc)
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except FileNotFoundError as exc:
            logger.exception("Resource missing: %s", exc)
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            logger.exception("Processing error: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            logger.exception("Unexpected error during processing")
            raise HTTPException(
                status_code=500, detail="An unexpected error occurred during processing."
            ) from exc
        finally:
            try:
                os.remove(tmp_file.name)
            except OSError:
                logger.warning("Failed to remove temp file '%s'", tmp_file.name)


async def _copy_upload_to_disk(upload: UploadFile, destination: str) -> None:
    """Persist the uploaded file to disk without blocking the event loop."""

    def _copy() -> None:
        upload.file.seek(0)
        with open(destination, "wb") as target:
            shutil.copyfileobj(upload.file, target)

    await run_in_threadpool(_copy)


class IntentRequest(BaseModel):
    query: str


class IntentResponse(BaseModel):
    targets: List[str]
    colors: List[str] = []
    pairs: List[dict] = []  # List of {"object": str, "color": str} pairs


STOPWORDS = {
    "find",
    "show",
    "frame",
    "frames",
    "with",
    "please",
    "can",
    "you",
    "the",
    "a",
    "an",
    "any",
    "all",
    "of",
    "for",
    "look",
    "search",
    "detect",
    "spot",
    "every",
    "to",
    "in",
    "on",
    "at",
    "video",
    "footage",
    "objects",
    "and",
}


@app.post("/api/intent", response_model=IntentResponse)
async def parse_intent(payload: IntentRequest) -> IntentResponse:
    query = payload.query.strip()
    if not query:
        return IntentResponse(targets=[], colors=[], pairs=[])

    targets: List[str] = []
    colors: List[str] = []
    pairs: List[dict] = []

    if settings.gemini_api_key:
        prompt = (
            "You extract computer-vision detection intents from natural language.\n"
            'Respond ONLY with a JSON object shaped like {"pairs": [{"object": "shirt", "color": "blue"}, {"object": "glasses", "color": "black"}]} for queries with specific object-color combinations.\n'
            'Use lowercase singular nouns (e.g., "person", "car", "laptop"). For colors, use basic color names (e.g., "red", "blue", "green", "yellow", "black", "white", "gray", "orange", "purple", "pink", "cyan").\n'
            'Example: "find a person wearing a blue shirt and black glasses" -> {"pairs": [{"object": "shirt", "color": "blue"}, {"object": "glasses", "color": "black"}]}\n'
            'Example: "find a red car" -> {"pairs": [{"object": "car", "color": "red"}]}\n'
            'Example: "find a person" -> {"pairs": [{"object": "person", "color": null}]}\n'
            'If a color is specified for an object, include it in the pair. If no color, set color to null.\n'
            'Omit unrelated words.\n'
            f"User request: \"{query}\"\n"
            "JSON response:"
        )

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
                    params={"key": settings.gemini_api_key},
                    json={
                        "contents": [
                            {
                                "role": "user",
                                "parts": [{"text": prompt}],
                            }
                        ],
                        "safetySettings": [
                            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                            {"category": "HARM_CATEGORY_SEXUAL", "threshold": "BLOCK_NONE"},
                            {"category": "HARM_CATEGORY_DANGEROUS", "threshold": "BLOCK_NONE"},
                        ],
                    },
                )

            if response.status_code == 200:
                data = response.json()
                text = (
                    data.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "")
                )
                if not text:
                    text = data.get("candidates", [{}])[0].get("outputText", "")

                match = re.search(r"\{[\s\S]*\}", text or "")
                if match:
                    try:
                        parsed_json = json.loads(match.group(0))
                        
                        # Extract pairs if available
                        candidate_pairs = parsed_json.get("pairs", [])
                        if isinstance(candidate_pairs, list):
                            for pair in candidate_pairs:
                                if isinstance(pair, dict):
                                    obj = pair.get("object", "").strip().lower()
                                    color = pair.get("color", "")
                                    if color:
                                        color = color.strip().lower()
                                    
                                    if obj:
                                        if color and color != "null":
                                            pairs.append({"object": obj, "color": color})
                                            targets.append(obj)
                                            colors.append(color)
                                        else:
                                            targets.append(obj)
                        
                        # Fallback: also check for old format
                        if not pairs:
                            candidate_targets = parsed_json.get("targets", [])
                            if isinstance(candidate_targets, list):
                                targets.extend(
                                    target.strip().lower()
                                    for target in candidate_targets
                                    if isinstance(target, str) and target.strip()
                                )
                            
                            candidate_colors = parsed_json.get("colors", [])
                            if isinstance(candidate_colors, list):
                                colors.extend(
                                    color.strip().lower()
                                    for color in candidate_colors
                                    if isinstance(color, str) and color.strip()
                                )
                    except json.JSONDecodeError as exc:  # pragma: no cover - malformed model reply
                        logger.warning("Failed to decode Gemini intent JSON: %s", exc)
            else:
                logger.warning(
                    "Gemini API returned status %s: %s",
                    response.status_code,
                    response.text,
                )
        except Exception:  # pragma: no cover - network failure, etc.
            logger.exception("Gemini intent extraction failed")

    # Fallback: extract colors and targets from query using pattern matching
    if not targets and not colors and not pairs:
        tokens = re.findall(r"\b[a-z]{3,}\b", query.lower())
        
        # Common color names
        color_keywords = {
            "red", "blue", "green", "yellow", "orange", "purple", "pink",
            "black", "white", "gray", "grey", "brown", "cyan", "navy",
            "maroon", "violet", "indigo", "turquoise", "lime", "olive",
            "teal", "aqua", "magenta", "silver", "gold", "beige", "tan",
        }
        
        # Try to extract color-object pairs using simple pattern matching
        # Pattern: "color object" (e.g., "blue shirt", "black glasses")
        words = query.lower().split()
        for i in range(len(words) - 1):
            if words[i] in color_keywords and words[i+1] not in STOPWORDS and words[i+1] not in color_keywords:
                pairs.append({"object": words[i+1], "color": words[i]})
                targets.append(words[i+1])
                colors.append(words[i])
        
        # If no pairs found, extract colors and targets separately
        if not pairs:
            for token in tokens:
                if token in color_keywords:
                    colors.append(token)
                elif token not in STOPWORDS:
                    targets.append(token)
        
        targets = sorted(set(targets))
        colors = sorted(set(colors))
    
    # Clean up results
    targets = sorted({target for target in targets if target and target not in STOPWORDS})
    colors = sorted(set(colors))
    
    # Remove duplicates from pairs
    unique_pairs = []
    seen = set()
    for pair in pairs:
        key = (pair.get("object", ""), pair.get("color", ""))
        if key not in seen:
            seen.add(key)
            unique_pairs.append(pair)
    pairs = unique_pairs

    return IntentResponse(targets=targets, colors=colors, pairs=pairs)
