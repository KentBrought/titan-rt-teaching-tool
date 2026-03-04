"""
Generate a grayscale displacement/height map from the ISS basemap PNG.

Reads the full-resolution equirectangular basemap, converts to luminance,
normalises to 0-255, and writes a 2048x1024 grayscale PNG suitable for use
as a Three.js displacementMap.

Usage:
    python generate_heightmap.py
"""

import os
from PIL import Image
import numpy as np

# The source image is ~265 megapixels; raise PIL's decompression limit
Image.MAX_IMAGE_PIXELS = 300_000_000

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_PATH = os.path.join(
    SCRIPT_DIR,
    "public", "assets", "3d-assets", "ISS-basemap",
    "Titan_Controlled_GlobalEqui_V6NoArcEdgesClouds_702M_WeightedAverage_ComboIncV2Ema60_Sharpen31x31.png",
)
OUT_WIDTH = 2048
OUT_HEIGHT = 1024
OUT_PATH = os.path.join(SCRIPT_DIR, "public", "assets", "3d-assets", "titan_heightmap.png")


def main():
    print(f"Loading source image: {SRC_PATH}")
    img = Image.open(SRC_PATH)
    print(f"  Original size: {img.size[0]} x {img.size[1]}, mode={img.mode}")

    # Convert to grayscale (luminance)
    gray = img.convert("L")

    # Resize to target dimensions with high-quality downsampling
    print(f"  Resizing to {OUT_WIDTH} x {OUT_HEIGHT} ...")
    resized = gray.resize((OUT_WIDTH, OUT_HEIGHT), Image.LANCZOS)

    # Normalise to full 0-255 range for maximum displacement contrast
    arr = np.array(resized, dtype=np.float32)
    lo, hi = arr.min(), arr.max()
    if hi > lo:
        arr = (arr - lo) / (hi - lo) * 255.0
    arr = arr.astype(np.uint8)

    out_img = Image.fromarray(arr, mode="L")
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    out_img.save(OUT_PATH, optimize=True)
    file_size = os.path.getsize(OUT_PATH)
    print(f"  Saved: {OUT_PATH}  ({file_size / 1024:.0f} KB)")
    print("Done.")


if __name__ == "__main__":
    main()
