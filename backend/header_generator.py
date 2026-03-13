import os
import uuid
import requests
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key) if api_key else None

STYLE_TEMPLATE = "soft pastel colors, minimalist medical illustration, female health theme, modern digital health branding, soft gradients, clean background, professional blog header style"

def generate_header(title, output_dir="uploads/generated_headers/"):
    """
    Generates a blog header image using DALL-E 3 based on a title and style template.
    """
    prompt = f"{STYLE_TEMPLATE}. Content: {title}"
    
    try:
        if not client:
            return None, "OpenAI API key not configured."
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            n=1,
            size="1024x1024",
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
        print(f"Error generating image for title '{title}': {str(e)}")
        return None, str(e)

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
