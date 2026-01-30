# Breed - AI Image Generator

Generate images using Google Gemini via OpenRouter API. Supports text-to-image, image-to-image, and image "breeding" (combining two images).

## Features

- **Text-to-image**: Generate images from text prompts
- **Image-to-image**: Transform existing images based on prompts
- **Image breeding**: Combine two images into a new hybrid image

## Setup

1. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set your OpenRouter API key:
   ```bash
   export OPENROUTER_API_KEY='your-key-here'
   ```
   Or create a `.env` file with:
   ```
   OPENROUTER_API_KEY=your-key-here
   ```

## Usage

### Text-to-image
```bash
python generate_image.py --prompt "A sunset over mountains" --output sunset.png
```

### Image-to-image
```bash
python generate_image.py --input photo.jpg --prompt "Make it look like a watercolor painting" --output watercolor.png
```

### Breed two images
```bash
python generate_image.py --input cat.jpg --input2 dog.jpg --prompt "Create a hybrid animal" --output catdog.png
```

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--prompt` | `-p` | Text prompt describing the image (required) |
| `--output` | `-o` | Output file path (default: generated_image.png) |
| `--input` | `-i` | Input image for image-to-image generation |
| `--input2` | `-i2` | Second input image for breeding |
| `--model` | `-m` | Model to use (default: google/gemini-3-pro-image-preview) |

## Requirements

- Python 3.8+
- OpenRouter API key with access to Gemini models
