import cv2
import torch
from ultralytics import YOLO
import numpy as np

def test_with_webcam():
    # Load your custom model
    print("📦 Loading YOLO model...")
    try:
        model = YOLO("model.pt")
        print("✅ Model loaded successfully!")
        print(f"📋 Classes: {model.names}")
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        return
    
    # Try different camera indices (macOS often uses different indices)
    camera_indices = [0, 1, 2, 3]  # Try different camera indices
    
    cap = None
    selected_camera = None
    
    for camera_index in camera_indices:
        print(f"🔍 Trying camera index {camera_index}...")
        cap = cv2.VideoCapture(camera_index)
        
        # Try to read a frame to verify the camera works
        ret, frame = cap.read()
        if ret:
            selected_camera = camera_index
            print(f"✅ Camera {camera_index} works!")
            break
        else:
            print(f"❌ Camera {camera_index} failed")
            cap.release()
    
    if selected_camera is None:
        print("❌ Error: Could not find any working camera")
        print("💡 Try these solutions:")
        print("   1. Make sure no other app is using the camera")
        print("   2. Grant camera permissions to Terminal in System Preferences")
        print("   3. Try restarting your computer")
        return
    
    # Reopen the working camera
    cap = cv2.VideoCapture(selected_camera)
    
    # Set camera properties for better performance
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 30)
    
    print("🎥 Webcam started successfully!")
    print("🎯 Hold objects in front of the camera to test detection")
    print("🔧 Controls: 'q' to quit, 's' to save frame, '+'/'-' to adjust confidence")
    
    confidence_threshold = 0.3
    
    while True:
        # Read frame from webcam
        ret, frame = cap.read()
        if not ret:
            print("❌ Failed to grab frame - camera may have disconnected")
            break
        
        # Flip frame horizontally for mirror effect (more natural)
        frame = cv2.flip(frame, 1)
        display_frame = frame.copy()
        
        # Run YOLO detection
        try:
            results = model(frame, conf=confidence_threshold, verbose=False)
            
            detections_found = False
            
            for result in results:
                if result.boxes is not None and len(result.boxes) > 0:
                    for box, cls, conf in zip(result.boxes.xyxy, result.boxes.cls, result.boxes.conf):
                        class_id = int(cls)
                        class_name = model.names[class_id]
                        confidence = float(conf)
                        
                        if confidence >= confidence_threshold:
                            detections_found = True
                            
                            # Convert coordinates to integers
                            x1, y1, x2, y2 = map(int, box.tolist())
                            
                            # Choose color based on class
                            colors = {
                                'black_pen': (0, 0, 0),        # Black
                                'blue_pen': (255, 0, 0),       # Blue
                                'green_pen': (0, 255, 0),      # Green  
                                'wrist_watch': (0, 255, 255),  # Yellow
                            }
                            color = colors.get(class_name, (0, 255, 0))  # Default green
                            
                            # Draw bounding box
                            cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 3)
                            
                            # Draw label with background
                            label = f"{class_name} {confidence:.2f}"
                            label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
                            
                            # Background for label
                            cv2.rectangle(display_frame, 
                                        (x1, y1 - label_size[1] - 15), 
                                        (x1 + label_size[0] + 10, y1), 
                                        color, -1)
                            
                            # Label text
                            cv2.putText(display_frame, label, (x1 + 5, y1 - 5), 
                                      cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                            
                            print(f"🎯 Detected: {class_name} (confidence: {confidence:.3f})")
        
        except Exception as e:
            print(f"⚠️ Detection error: {e}")
        
        # Display information
        info_text = f"Confidence: {confidence_threshold:.2f} | Cam: {selected_camera}"
        cv2.putText(display_frame, info_text, (10, 30), 
                  cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Instructions
        instructions = [
            "Press 'q' to quit",
            "Press 's' to save frame",
            "Press '+' to increase confidence", 
            "Press '-' to decrease confidence"
        ]
        
        for i, instruction in enumerate(instructions):
            cv2.putText(display_frame, instruction, (10, 60 + i * 25),
                      cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        # Show the frame
        cv2.imshow('YOLO Object Detection - Webcam', display_frame)
        
        # Handle key presses
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('s'):
            # Save current frame
            import time
            timestamp = int(time.time())
            filename = f'webcam_capture_{timestamp}.jpg'
            cv2.imwrite(filename, frame)
            print(f"💾 Frame saved as '{filename}'")
        elif key == ord('+'):
            # Increase confidence threshold
            confidence_threshold = min(0.9, confidence_threshold + 0.05)
            print(f"📈 Confidence threshold: {confidence_threshold:.2f}")
        elif key == ord('-'):
            # Decrease confidence threshold
            confidence_threshold = max(0.1, confidence_threshold - 0.05)
            print(f"📉 Confidence threshold: {confidence_threshold:.2f}")
    
    # Clean up
    cap.release()
    cv2.destroyAllWindows()
    print("👋 Webcam test completed")

if __name__ == "__main__":
    test_with_webcam()