import cv2
import os
from ultralytics import YOLO
from tqdm import tqdm

VIDEO_PATH = "video.MOV"      
FRAME_FOLDER = "frames"       
FRAME_RATE = 1                
TARGET_OBJECT = "black_pen"      

os.makedirs(FRAME_FOLDER, exist_ok=True)

model = YOLO("model.pt")  

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

    
    if int(video.get(1)) % fps == 0:
        frame_path = os.path.join(FRAME_FOLDER, f"frame_{second}.jpg")
        cv2.imwrite(frame_path, frame)
        frames.append(frame_path)
        second += 1

video.release()
print(f"Extracted {len(frames)} frames.")

detections = []

for frame_path in tqdm(frames, desc="Detecting objects"):
    results = model(frame_path, verbose=False)
    names = results[0].names
    detected_classes = [names[int(cls)] for cls in results[0].boxes.cls]

    if TARGET_OBJECT in detected_classes:
        
        timestamp = int(frame_path.split("_")[-1].split(".")[0])
        detections.append(timestamp)

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
