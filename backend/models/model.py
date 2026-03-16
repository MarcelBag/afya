import os
import cv2
import numpy as np
from PIL import Image
try:
    from .gemini_utils import analyze_image_gemini
    GEMINI_INTEGRATION = True
except ImportError:
    print("Warning: Gemini utilities not found.")
    GEMINI_INTEGRATION = False

# ------------------------------------------------------------------
# Load Models (LEGACY - DEPRECATED)
# ------------------------------------------------------------------
# We are no longer loading models locally to save VPS resources.
# All classification and detection is offloaded to Gemini 1.5 Flash API.

# ------------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------------
def preprocess_image(image_path, target_size=(224, 224)):
    """Only used for local processing if needed, but mostly deprecated."""
    image = Image.open(image_path).convert("RGB")
    image = image.resize(target_size)
    image_array = np.array(image) / 255.0
    image_array = np.expand_dims(image_array, axis=0)
    return image_array

def is_skin_color_image(image_path, skin_threshold=0.15):
    """
    A simple heuristic: converts the image to HSV and calculates the fraction of pixels
    that fall into typical skin tone ranges. Returns True if the ratio exceeds skin_threshold.
    This remains local as it's very lightweight (OpenCV).
    """
    image = cv2.imread(image_path)
    if image is None:
        return False
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    lower_skin = np.array([0, 30, 60], dtype=np.uint8)
    upper_skin = np.array([20, 150, 255], dtype=np.uint8)
    mask = cv2.inRange(hsv, lower_skin, upper_skin)
    skin_pixels = cv2.countNonZero(mask)
    total_pixels = image.shape[0] * image.shape[1]
    ratio = skin_pixels / total_pixels
    return ratio >= skin_threshold

# ------------------------------------------------------------------
# Integrated Prediction Pipeline (Gemini Version)
# ------------------------------------------------------------------
def predict(image_path):
    """
    New integrated pipeline using Gemini 1.5 Flash:
    1) Local HSV check for skin content (very fast pre-filter).
    2) Gemini API for both person detection and classification.
    """
    if not GEMINI_INTEGRATION:
        return "Invalid", "Image analysis is currently unavailable (Afya Integration missing)."

    # Step 1: Local HSV check for skin content (avoid API calls for obviously bad images).
    if not is_skin_color_image(image_path, skin_threshold=0.12):
        return "Invalid", "Please post a valid skin image (insufficient skin tone detected)."
    
    # Step 2: Use Gemini for person detection and lesion classification.
    result = analyze_image_gemini(image_path)
    
    if not result:
        return "Invalid", "Error communicating with Afya. Please try again."

    if result.get("person_detected"):
        return "Invalid", "Please post a skin close-up (person or face detected)."

    label = result.get("prediction", "Benign")
    confidence = result.get("confidence", 0.0)

    return label, float(round(confidence, 2))