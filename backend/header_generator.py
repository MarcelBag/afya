import os
import uuid
import requests
import logging
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key) if api_key else None

STYLE_TEMPLATE = "soft pastel colors, minimalist medical illustration, female health theme, modern digital health branding, soft gradients, clean background, professional blog header style"

GENERIC_GENERATION_ERROR = "Header generation is temporarily unavailable. Please try again in a few minutes."


def public_generation_error(error):
    error_text = str(error).lower()
    if "api key" in error_text or "invalid_api_key" in error_text or "401" in error_text:
        return "Header generation is not configured correctly. Please contact support."
    if "rate limit" in error_text or "429" in error_text:
        return "Header generation is busy right now. Please try again in a few minutes."
    return GENERIC_GENERATION_ERROR


def generate_header(title, output_dir="uploads/generated_headers/"):
    """
    Generates a blog header image using DALL-E 3 based on a title and style template.
    """
    prompt = f"{STYLE_TEMPLATE}. Content: {title}"
    
    try:
        if not client:
            return None, "Header generation is not configured correctly. Please contact support."
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            n=1,
            size="1792x1024",
            quality="standard",
        )
        
        image_url = response.data[0].url
        image_data = requests.get(image_url).content
        
        # Generate a unique filename
        filename = f"header_{uuid.uuid4().hex[:8]}.png"
        filepath = os.path.join(output_dir, filename)
        
        # Ensure directory exists (though flask_api.py should handle this)
        os.makedirs(output_dir, exist_ok=True)
        
        with open(filepath, 'wb') as f:
            f.write(image_data)
            
        return filepath, None
    except Exception as e:
        logger.exception("Error generating image for title '%s'.", title)
        return None, public_generation_error(e)

def generate_headers_batch(titles, output_dir="uploads/generated_headers/"):
    """
    Loops through titles and generates headers for each.
    """
    results = []
    for title in titles:
        path, error = generate_header(title, output_dir)
        if path:
            # We want to return the web-accessible path
            web_path = f"/uploads/generated_headers/{os.path.basename(path)}"
            results.append({"title": title, "image": web_path})
        else:
            results.append({"title": title, "error": error})
    return results
