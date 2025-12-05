# Sherlocked

End-to-end object detection pipeline featuring a FastAPI backend for YOLO inference and a Next.js frontend for video uploads and visualization.

## Project Structure

```
.
├── server/               # FastAPI application
│   ├── app/
│   │   ├── config.py
│   │   ├── main.py        # API entrypoint
│   │   └── services/
│   │       └── detector.py
│   └── requirements.txt
├── client/                # Next.js 14 frontend
│   └── app/
│       └── api/process-video/route.ts
├── main.py                # CLI helper for local processing
├── yolov8n.pt             # Default YOLO model weights
└── video.MOV              # Sample video (example)
```

## Backend (FastAPI + YOLO)

1. Create a Python virtual environment (Python 3.10+ recommended):

   ```bash
   cd /Users/mdabubokar/Documents/sherlocked
   python -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:

   ```bash
   pip install -r server/requirements.txt
   ```

3. Ensure your YOLO model weights are accessible (default path `yolov8n.pt` at the
   repository root). You can override via the `YOLO_MODEL_PATH` environment
   variable.

4. Run the API:

   ```bash
   uvicorn server.app.main:app --reload --host 0.0.0.0 --port 8000
   ```

5. Optional environment variables:

   - `YOLO_MODEL_PATH`: custom path to `.pt` weights (defaults to `yolov8n.pt`)
   - `FRAME_INTERVAL_SECONDS`: default frame sampling interval
   - `MIN_CONFIDENCE`: default detection confidence threshold
   - `CORS_ORIGINS`: comma-separated list of allowed origins

## Frontend (Next.js)

1. Install dependencies (one time):

   ```bash
   cd /Users/mdabubokar/Documents/sherlocked/client
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Configure the backend URL via environment variable:

   - Create `client/.env.local` with:

     ```
     BACKEND_URL=http://localhost:8000
     GEMINI_API_KEY=your_gemini_api_key
     ```

   The Next.js route at `/api/process-video` proxies requests to the backend, and `/api/intent` uses Gemini to translate natural language queries into detector targets.

## CLI Usage

The `main.py` script allows running detections without the web UI:

```bash
python main.py --video path/to/video.mp4 --target person --frame-interval 1 --min-confidence 0.25 --output detections.json
```

## Development Tips
- Keep the backend running while interacting with the frontend UI.
- Monitor backend logs for progress updates and errors.
- Large videos may require increasing the frame interval or confidence
  threshold to speed up processing.
