# AI Generation Layer: Enforces visual coherence via a shared design template.
# This script separates brand identity (style) from content (topic) to ensure 
# every generated asset is ready for professional clinical use.
import os
import uuid
import requests
import logging
from openai import OpenAI
from dotenv import load_dotenv

# Load secure environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# OpenAI API Configuration
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key) if api_key else None

# Strategic Style Template: Defines the visual DNA for Endo Health brand coherence
STYLE_TEMPLATE = (
    "soft pastel colors, minimalist medical illustration, female health theme, "
    "modern digital health branding, soft gradients, clean background, "
    "professional blog header style"
)

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
    This function makes one picture for your blog title.
    It uses DALL-E 3, the smart AI for making photos.
    """
    # We mix your title with our special Afya style
    prompt = f"{STYLE_TEMPLATE}. Content: {title}"
    
    try:
        if not client:
            return None, "Header generation is not configured correctly. Please contact support."
            
        # We send our request to the OpenAI people
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            n=1,
            size="1792x1024",
            quality="standard",
        )
        
        # The photo is here! Now we download it and put it in our server here
        image_url = response.data[0].url
        image_data = requests.get(image_url).content
        
        # We give the photo a name that is unique so they don't mix
        filename = f"header_{uuid.uuid4().hex[:8]}.png"
        filepath = os.path.join(output_dir, filename)
        
        # Make sure the folder for keeping photos is there
        os.makedirs(output_dir, exist_ok=True)
        
        # Now write the data into a real file
        with open(filepath, 'wb') as f:
            f.write(image_data)
            
        return filepath, None
    except Exception as e:
        logger.exception("Error generating image for title '%s'.", title)
        return None, public_generation_error(e)

def generate_headers_batch(titles, output_dir="uploads/generated_headers/"):
    """
    Here now we do the loop for all 10 titles.
    It does one picture then another one until the job is finished.
    """
    results = []
    print(f"Okay master, I start to make {len(titles)} pictures now...")
    
    for title in titles:
        path, error = generate_header(title, output_dir)
        if path:
            # We return the filename so the website can show it
            web_path = f"/uploads/generated_headers/{os.path.basename(path)}"
            results.append({"title": title, "image": web_path})
            print(f"Good! The picture for '{title}' is finished well.")
        else:
            results.append({"title": title, "error": error})
            print(f"Sorry too much, this one for '{title}' has refused.")
            
    return results

# This is an example if you want to use it alone
if __name__ == "__main__":
    test_titles = [
        "How to manage PMS naturally",
        "Understanding Endometriosis",
        "The science of Menopause",
        "Healthy eating for your cycle",
        "Mental health and hormones",
        "Exercise tips for pregnancy",
        "Postpartum care 101",
        "Dealing with PCOS symptoms",
        "Importance of regular checkups",
        "Sleep and reproductive health"
    ]
    generate_headers_batch(test_titles)
