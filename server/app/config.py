from __future__ import annotations
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import List

@dataclass(frozen=True)
class Settings:
    """Runtime configuration loaded from environment variables."""

    model_path: str = os.getenv("YOLO_MODEL_PATH", "model.pt")
    frame_interval_seconds: float = float(os.getenv("FRAME_INTERVAL_SECONDS", "1.0"))
    min_confidence: float = float(os.getenv("MIN_CONFIDENCE", "0.6"))
    gemini_api_key: str | None = os.getenv("GEMINI_API_KEY")
    cors_origins: List[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        cors_raw = os.getenv("CORS_ORIGINS", "")
        object.__setattr__(
            self,
            "cors_origins",
            [origin.strip() for origin in cors_raw.split(",") if origin.strip()]
            or ["*"],
        )


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()

settings = get_settings()
