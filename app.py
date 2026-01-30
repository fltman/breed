#!/usr/bin/env python3
"""
Evolution Game - Web interface for breeding AI-generated animals.
"""

import base64
import os
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, render_template, send_from_directory
from flask_cors import CORS

try:
    from openai import OpenAI
except ImportError:
    print("ERROR: openai package not installed. Run: pip install openai flask flask-cors")
    exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = Flask(__name__)
CORS(app)

# Directory for storing generated images
IMAGES_DIR = Path("static/generated")
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# Models
TEXT_MODEL = "anthropic/claude-haiku-4.5"
IMAGE_MODEL = "google/gemini-3-pro-image-preview"


def get_client():
    """Initialize OpenAI client with OpenRouter configuration."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY environment variable not set")

    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )


def encode_image(image_path: str) -> str:
    """Encode an image file to base64."""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def extract_image_from_response(response) -> tuple[str | None, str | None]:
    """Extract image data and text from API response."""
    if not response.choices or not response.choices[0].message:
        return None, None

    message = response.choices[0].message
    text_content = message.content if message.content else None
    image_data = None

    if hasattr(message, 'images') and message.images:
        for img in message.images:
            if img["type"] == "image_url" and img["image_url"]["url"].startswith("data:image"):
                data_url = img["image_url"]["url"]
                image_data = data_url.split(',', 1)[1]
                break

    return image_data, text_content


@app.route('/')
def index():
    """Serve the main game page."""
    return render_template('index.html')


@app.route('/static/generated/<path:filename>')
def serve_generated(filename):
    """Serve generated images."""
    return send_from_directory(IMAGES_DIR, filename)


@app.route('/api/random-prompt', methods=['GET'])
def random_prompt():
    """Generate a random creative creature prompt using LLM."""
    client = get_client()

    try:
        response = client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": """Generate a single creative and unique fantasy creature description for an image generator.
Be imaginative! Mix unexpected elements like:
- Animal hybrids (e.g., "a bioluminescent axolotl-phoenix")
- Elemental creatures (e.g., "a storm spirit made of lightning")
- Mythical beings (e.g., "a tiny dragon that lives in teacups")
- Surreal combinations (e.g., "a crystal deer with galaxies in its antlers")

Respond with ONLY the creature description, nothing else. Keep it under 15 words."""
                }
            ],
        )

        prompt = response.choices[0].message.content.strip()
        return jsonify({"prompt": prompt})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/generate', methods=['POST'])
def generate_animal():
    """Generate a new animal from a text prompt."""
    data = request.json
    prompt = data.get('prompt', 'a cute fantasy animal')

    client = get_client()

    full_prompt = f"""Generate an image of: {prompt}

Make it detailed and visually appealing.

Also give it a short creative name. Respond with ONLY the name."""

    try:
        response = client.chat.completions.create(
            model=IMAGE_MODEL,
            messages=[{"role": "user", "content": full_prompt}],
        )

        image_data, name = extract_image_from_response(response)

        if not image_data:
            return jsonify({"error": "No image generated"}), 500

        # Save image
        image_id = str(uuid.uuid4())[:8]
        image_path = IMAGES_DIR / f"{image_id}.png"
        with open(image_path, "wb") as f:
            f.write(base64.b64decode(image_data))

        return jsonify({
            "id": image_id,
            "name": name.strip() if name else "Unknown Creature",
            "image_url": f"/static/generated/{image_id}.png"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/breed', methods=['POST'])
def breed_animals():
    """Breed two animals to create a new one."""
    data = request.json
    parent1_id = data.get('parent1_id')
    parent2_id = data.get('parent2_id')
    parent1_name = data.get('parent1_name', 'creature 1')
    parent2_name = data.get('parent2_name', 'creature 2')

    # Get parent images
    parent1_path = IMAGES_DIR / f"{parent1_id}.png"
    parent2_path = IMAGES_DIR / f"{parent2_id}.png"

    if not parent1_path.exists() or not parent2_path.exists():
        return jsonify({"error": "Parent images not found"}), 404

    client = get_client()

    base64_img1 = encode_image(str(parent1_path))
    base64_img2 = encode_image(str(parent2_path))

    prompt = f"""You are a fantasy creature designer. Two magical creatures have bred and produced offspring.

PARENT 1: "{parent1_name}" (see first image)
PARENT 2: "{parent2_name}" (see second image)

Your task: Imagine and design their OFFSPRING - a completely NEW fantastical creature that could believably be born from these two parents.

Think about:
- What body structure would it inherit? (size, shape, limbs)
- What textures and materials? (scales, fur, crystal, coral, etc.)
- What colors and patterns would emerge from mixing the parents?
- What special abilities or magical properties might it have?
- What environment would it live in?

Create a detailed, imaginative image of this NEW creature. It should feel like a real fantasy species that inherited traits from both parents in surprising and creative ways. Don't just blend the images - imagine what their CHILD would actually look like as a unique being.

Also invent a creative species name for this offspring that reflects its heritage. Respond with ONLY the name, nothing else."""

    try:
        response = client.chat.completions.create(
            model=IMAGE_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_img1}"}},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_img2}"}}
                    ]
                }
            ],
        )

        image_data, name = extract_image_from_response(response)

        if not image_data:
            return jsonify({"error": "No image generated"}), 500

        # Save image
        image_id = str(uuid.uuid4())[:8]
        image_path = IMAGES_DIR / f"{image_id}.png"
        with open(image_path, "wb") as f:
            f.write(base64.b64decode(image_data))

        return jsonify({
            "id": image_id,
            "name": name.strip() if name else f"{parent1_name[:3]}{parent2_name[-3:]}",
            "image_url": f"/static/generated/{image_id}.png",
            "parents": [parent1_id, parent2_id]
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


STATE_FILE = Path("state.json")


@app.route('/api/save-state', methods=['POST'])
def save_state():
    """Save the current game state."""
    data = request.json
    try:
        with open(STATE_FILE, 'w') as f:
            import json
            json.dump(data, f, indent=2)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/load-state', methods=['GET'])
def load_state():
    """Load the saved game state."""
    try:
        if STATE_FILE.exists():
            with open(STATE_FILE, 'r') as f:
                import json
                return jsonify(json.load(f))
        return jsonify({"animals": [], "familyLines": []})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5001)
