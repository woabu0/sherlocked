"""
Color extraction service for detected objects.

This module provides functionality to extract dominant colors from image regions
and convert them to human-readable color names.
"""

from __future__ import annotations
import logging
from typing import Optional, Tuple, List
import cv2
import numpy as np

logger = logging.getLogger(__name__)


# Define color ranges in HSV space with their names
# HSV ranges: Hue (0-180), Saturation (0-255), Value (0-255)
COLOR_RANGES = {
    "red": [
        # Red wraps around in HSV, so we need two ranges
        {"lower": np.array([0, 50, 50]), "upper": np.array([10, 255, 255])},
        {"lower": np.array([170, 50, 50]), "upper": np.array([180, 255, 255])},
    ],
    "orange": [
        {"lower": np.array([11, 50, 50]), "upper": np.array([25, 255, 255])},
    ],
    "yellow": [
        {"lower": np.array([26, 50, 50]), "upper": np.array([35, 255, 255])},
    ],
    "green": [
        {"lower": np.array([36, 50, 50]), "upper": np.array([85, 255, 255])},
    ],
    "cyan": [
        {"lower": np.array([86, 50, 50]), "upper": np.array([95, 255, 255])},
    ],
    "blue": [
        {"lower": np.array([96, 50, 50]), "upper": np.array([130, 255, 255])},
    ],
    "purple": [
        {"lower": np.array([131, 50, 50]), "upper": np.array([155, 255, 255])},
    ],
    "pink": [
        {"lower": np.array([156, 50, 50]), "upper": np.array([169, 255, 255])},
    ],
    "white": [
        {"lower": np.array([0, 0, 200]), "upper": np.array([180, 30, 255])},
    ],
    "black": [
        {"lower": np.array([0, 0, 0]), "upper": np.array([180, 255, 50])},
    ],
    "gray": [
        {"lower": np.array([0, 0, 51]), "upper": np.array([180, 30, 199])},
    ],
}


def extract_dominant_color(
    frame: np.ndarray,
    bbox: List[float],
    k: int = 3,
) -> Tuple[Optional[str], Optional[List[int]]]:
    """
    Extract the dominant color from a bounding box region in a frame.

    Args:
        frame: The full frame image (BGR format from OpenCV)
        bbox: Bounding box coordinates [x1, y1, x2, y2]
        k: Number of clusters for k-means (default: 3)

    Returns:
        Tuple of (color_name, rgb_values) where:
        - color_name is a human-readable color string (e.g., "red", "blue")
        - rgb_values is a list of [R, G, B] values for the dominant color
        Returns (None, None) if extraction fails
    """
    try:
        # Extract bounding box coordinates
        x1, y1, x2, y2 = map(int, bbox)
        
        # Ensure coordinates are within frame bounds
        height, width = frame.shape[:2]
        x1 = max(0, min(x1, width - 1))
        y1 = max(0, min(y1, height - 1))
        x2 = max(0, min(x2, width))
        y2 = max(0, min(y2, height))
        
        # Check if bounding box is valid
        if x2 <= x1 or y2 <= y1:
            logger.warning("Invalid bounding box: %s", bbox)
            return None, None
        
        # Crop the region of interest
        roi = frame[y1:y2, x1:x2]
        
        # Check if ROI is too small
        if roi.size == 0 or roi.shape[0] < 5 or roi.shape[1] < 5:
            logger.debug("ROI too small for color extraction")
            return None, None
        
        # Resize if ROI is very large (for performance)
        max_dimension = 200
        if roi.shape[0] > max_dimension or roi.shape[1] > max_dimension:
            scale = max_dimension / max(roi.shape[0], roi.shape[1])
            new_width = int(roi.shape[1] * scale)
            new_height = int(roi.shape[0] * scale)
            roi = cv2.resize(roi, (new_width, new_height))
        
        # Convert to HSV for better color detection
        hsv_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        
        # Reshape to a list of pixels
        pixels = hsv_roi.reshape(-1, 3).astype(np.float32)
        
        # Apply k-means clustering to find dominant colors
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
        _, labels, centers = cv2.kmeans(
            pixels, k, None, criteria, 10, cv2.KMEANS_PP_CENTERS
        )
        
        # Count pixels in each cluster
        unique, counts = np.unique(labels, return_counts=True)
        
        # Get the most dominant cluster
        dominant_cluster_idx = unique[np.argmax(counts)]
        dominant_color_hsv = centers[dominant_cluster_idx].astype(np.uint8)
        
        # Convert HSV back to BGR then to RGB
        dominant_color_bgr = cv2.cvtColor(
            np.uint8([[dominant_color_hsv]]), cv2.COLOR_HSV2BGR
        )[0][0]
        dominant_color_rgb = [
            int(dominant_color_bgr[2]),  # R
            int(dominant_color_bgr[1]),  # G
            int(dominant_color_bgr[0]),  # B
        ]
        
        # Map HSV color to color name
        color_name = _hsv_to_color_name(dominant_color_hsv)
        
        logger.debug(
            "Extracted color: %s (RGB: %s, HSV: %s)",
            color_name,
            dominant_color_rgb,
            dominant_color_hsv.tolist(),
        )
        
        return color_name, dominant_color_rgb
        
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to extract color from bbox %s: %s", bbox, exc)
        return None, None


def _hsv_to_color_name(hsv: np.ndarray) -> str:
    """
    Convert HSV color to a human-readable color name.

    Args:
        hsv: HSV color values as numpy array [H, S, V]

    Returns:
        Color name as string (e.g., "red", "blue", "green")
    """
    # Check each color range
    for color_name, ranges in COLOR_RANGES.items():
        for color_range in ranges:
            lower = color_range["lower"]
            upper = color_range["upper"]
            
            # Check if the HSV value falls within this range
            if np.all(hsv >= lower) and np.all(hsv <= upper):
                return color_name
    
    # If no match found, determine based on saturation and value
    h, s, v = hsv
    
    # Low saturation colors
    if s < 30:
        if v > 200:
            return "white"
        elif v < 50:
            return "black"
        else:
            return "gray"
    
    # High saturation colors - determine by hue
    if h < 10 or h >= 170:
        return "red"
    elif h < 25:
        return "orange"
    elif h < 35:
        return "yellow"
    elif h < 85:
        return "green"
    elif h < 95:
        return "cyan"
    elif h < 130:
        return "blue"
    elif h < 155:
        return "purple"
    else:
        return "pink"


def color_matches(detected_color: Optional[str], query_color: str) -> bool:
    """
    Check if a detected color matches a query color with STRICT matching.

    Args:
        detected_color: The color extracted from the object
        query_color: The color specified in the user's query

    Returns:
        True if colors match exactly, False otherwise
    """
    if detected_color is None:
        return False
    
    # Normalize to lowercase
    detected_color = detected_color.lower().strip()
    query_color = query_color.lower().strip()
    
    # Exact match only (strict matching)
    return detected_color == query_color
