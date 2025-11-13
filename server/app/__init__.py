"""
Backend application package initialization.

Exposes shared singletons (currently the YOLO detection service) that can be
imported across the FastAPI application without triggering circular imports.
"""


