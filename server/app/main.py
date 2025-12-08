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
        return IntentResponse(targets=[])

    targets: List[str] = []

    if settings.gemini_api_key:
        prompt = (
            "You extract computer-vision detection intents from natural language.\n"
            'Respond ONLY with a JSON object shaped like {"targets": ["object1", "object2"]} listing the relevant objects to detect.\n'
            'Use lowercase singular nouns (e.g., "person", "car", "laptop"). Omit unrelated words.\n'
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
                        candidate_targets = parsed_json.get("targets", [])
                        if isinstance(candidate_targets, list):
                            targets.extend(
                                target.strip().lower()
                                for target in candidate_targets
                                if isinstance(target, str) and target.strip()
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

    if not targets:
        tokens = re.findall(r"\b[a-z]{3,}\b", query.lower())
        targets = sorted({token for token in tokens if token not in STOPWORDS})

    targets = sorted({target for target in targets if target and target not in STOPWORDS})

    return IntentResponse(targets=targets)
