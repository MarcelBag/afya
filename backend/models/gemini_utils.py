import os
import google.generativeai as genai
from PIL import Image
from dotenv import load_dotenv
import json

# Load environment variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("Google_AI_Studio")
if not GEMINI_API_KEY:
    print("Warning: No Gemini API key found in environment variables (tried GEMINI_API_KEY and Google_AI_Studio).")
genai.configure(api_key=GEMINI_API_KEY)

# Use Gemini Flash Latest (1.5) for highest free quota
model = genai.GenerativeModel('gemini-flash-latest')

def analyze_image_gemini(image_path):
    """
    Uses Gemini 1.5 Flash to determine if an image contains a person 
    and classify skin lesions if present.
    """
    try:
        img = Image.open(image_path)
        
        prompt = """
        Analyze this image for dermatological purposes. 
        1. Does this image contain a person, a face, or recognizable body parts that are not just a close-up of skin? (Respond with 'person_detected': true/false)
        2. If it is a close-up of a skin condition, identify it. 
           - If it looks like skin cancer, classify it as 'Malignant' or 'Benign'.
           - If it looks like a common condition, identify it (e.g., 'Acne', 'Eczema', 'Psoriasis', 'Rash', 'Fungal Infection').
           - If unsure, use 'Undetermined'.
        3. Provide a confidence score between 0 and 100.
        
        Return ONLY a JSON object in this format:
        {
            "person_detected": boolean,
            "prediction": "string",
            "confidence": number,
            "is_cancer_related": boolean
        }
        """
        
        response = model.generate_content([prompt, img])
        
        # Extract JSON from response text (handling potential markdown formatting)
        text = response.text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
            
        result = json.loads(text)
        return result
    except Exception as e:
        print(f"Error in Gemini analysis: {e}")
        return None
