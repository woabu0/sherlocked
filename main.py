import cv2
import os
from ultralytics import YOLO
from tqdm import tqdm

# -----------------------------
# CONFIGURATION
# -----------------------------
VIDEO_PATH = "video.mp4"      # input video
FRAME_FOLDER = "frames"       # where to save frames
FRAME_RATE = 1                # extract 1 frame per second
TARGET_OBJECT = "car"      # change this to what you want to detect

# -----------------------------
# 1. Create folders
# -----------------------------
os.makedirs(FRAME_FOLDER, exist_ok=True)

# -----------------------------
# 2. Load YOLO model
# -----------------------------
model = YOLO("yolov8n.pt")  # nano model - fast and light

# -----------------------------
# 3. Extract frames every 1 second
# -----------------------------
video = cv2.VideoCapture(VIDEO_PATH)
fps = int(video.get(cv2.CAP_PROP_FPS))
frame_count = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
duration = frame_count / fps

print(f"Video length: {duration:.2f}s | FPS: {fps}")

frames = []
frame_id = 0
second = 0

while True:
    ret, frame = video.read()
    if not ret:
        break

    # Save 1 frame per second
    if int(video.get(1)) % fps == 0:
        frame_path = os.path.join(FRAME_FOLDER, f"frame_{second}.jpg")
        cv2.imwrite(frame_path, frame)
        frames.append(frame_path)
        second += 1

video.release()
print(f"Extracted {len(frames)} frames.")

# -----------------------------
# 4. Run detection and log timestamps
# -----------------------------
detections = []

for frame_path in tqdm(frames, desc="Detecting objects"):
    results = model(frame_path, verbose=False)
    names = results[0].names
    detected_classes = [names[int(cls)] for cls in results[0].boxes.cls]

    if TARGET_OBJECT in detected_classes:
        # Extract seconds from filename
        timestamp = int(frame_path.split("_")[-1].split(".")[0])
        detections.append(timestamp)

# -----------------------------
# 5. Save detection results
# -----------------------------
if detections:
    with open("detections.txt", "w") as f:
        for t in detections:
            mins = t // 60
            secs = t % 60
            f.write(f"Detected {TARGET_OBJECT} at {mins:02d}:{secs:02d}\n")

    print(f"\n✅ {TARGET_OBJECT.capitalize()} detected at:")
    for t in detections:
        mins = t // 60
        secs = t % 60
        print(f" - {mins:02d}:{secs:02d}")
else:
    print(f"\nNo '{TARGET_OBJECT}' detected.")
