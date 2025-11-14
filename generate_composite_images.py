"""
Temporary script to generate composite RGB images from CCD color image layers.
This script reads the .img files and creates composite images by mapping specific layers to RGB channels.
"""

import numpy as np
from PIL import Image
import os
import struct

def read_ccd_image(img_path):
    """
    Read a CCD .img file and return the 8 layers as a numpy array.
    
    Structure: 8 bands, 681 lines, 681 samples
    """
    with open(img_path, 'rb') as f:
        # Read all data as bytes
        data = f.read()
    
    # Parse as 32-bit floats (little-endian)
    num_bands = 8
    num_lines = 681
    num_samples = 681
    total_elements = num_bands * num_lines * num_samples
    
    # Convert bytes to float32 array
    floats = struct.unpack(f'<{total_elements}f', data[:total_elements * 4])
    
    # Reshape to [band][line][sample] order
    # Data is stored as [band][line][sample] with sample changing fastest
    image_data = np.array(floats).reshape((num_bands, num_lines, num_samples))
    
    return image_data

def normalize_layer(layer_data):
    """
    Normalize a layer to 0-255 range for display.
    Uses percentile-based normalization to handle outliers.
    """
    # Remove invalid values (NaN, Inf)
    valid_data = layer_data[np.isfinite(layer_data)]
    
    if len(valid_data) == 0:
        return np.zeros_like(layer_data, dtype=np.uint8)
    
    # Use percentile-based normalization (2nd to 98th percentile)
    p2 = np.percentile(valid_data, 2)
    p98 = np.percentile(valid_data, 98)
    
    if p98 == p2:
        # All values are the same
        return np.zeros_like(layer_data, dtype=np.uint8)
    
    # Normalize to 0-1 range
    normalized = (layer_data - p2) / (p98 - p2)
    
    # Clip to [0, 1] and convert to 0-255
    normalized = np.clip(normalized, 0, 1)
    return (normalized * 255).astype(np.uint8)

def create_composite(ccd_data, red_layer_idx, green_layer_idx, blue_layer_idx):
    """
    Create an RGB composite image from specified layers.
    
    Args:
        ccd_data: 3D numpy array [8, 681, 681]
        red_layer_idx: Index of layer for red channel (0-7)
        green_layer_idx: Index of layer for green channel (0-7)
        blue_layer_idx: Index of layer for blue channel (0-7)
    
    Returns:
        PIL Image with RGB composite
    """
    # Extract and normalize each layer
    red = normalize_layer(ccd_data[red_layer_idx])
    green = normalize_layer(ccd_data[green_layer_idx])
    blue = normalize_layer(ccd_data[blue_layer_idx])
    
    # Stack into RGB image
    rgb_array = np.stack([red, green, blue], axis=-1)
    
    # Create PIL Image
    return Image.fromarray(rgb_array, 'RGB')

def generate_composites_for_all_angles():
    """
    Generate composite images for all phase angles (0-355 in 5-degree increments).
    """
    base_dir = 'public/assets/raw'
    output_dir = 'public/assets'
    
    # Phase angles from 0 to 355 in 5-degree increments
    phase_angles = range(0, 360, 5)
    
    # Composite configurations
    # Note: Layers are 0-indexed, but user specified 1-indexed (layer 8 = index 7, etc.)
    composites = {
        '5_2_1.3': {
            'name': '5, 2, 1.3 µm',
            'red': 7,   # layer 8 (1-indexed) = index 7 (0-indexed)
            'green': 4, # layer 5 (1-indexed) = index 4 (0-indexed)
            'blue': 2   # layer 3 (1-indexed) = index 2 (0-indexed)
        },
        '2_1.6_1.3': {
            'name': '2, 1.6, 1.3 µm',
            'red': 4,   # layer 5 (1-indexed) = index 4 (0-indexed)
            'green': 3, # layer 4 (1-indexed) = index 3 (0-indexed)
            'blue': 2   # layer 3 (1-indexed) = index 2 (0-indexed)
        }
    }
    
    for phase_angle in phase_angles:
        padded_phase = f'{phase_angle:03d}'
        img_filename = f'2012_A0.1_p{padded_phase}_colorCCD.img'
        img_path = os.path.join(base_dir, img_filename)
        
        if not os.path.exists(img_path):
            print(f'Warning: {img_path} not found, skipping...')
            continue
        
        print(f'Processing phase angle {phase_angle}°...')
        
        try:
            # Read CCD image
            ccd_data = read_ccd_image(img_path)
            
            # Generate composites
            for comp_key, comp_config in composites.items():
                composite_img = create_composite(
                    ccd_data,
                    comp_config['red'],
                    comp_config['green'],
                    comp_config['blue']
                )
                
                # Save with naming convention: 2012_A0.1_p{phase}_{composite_key}.png
                output_filename = f'2012_A0.1_p{padded_phase}_{comp_key}.png'
                output_path = os.path.join(output_dir, output_filename)
                composite_img.save(output_path)
                print(f'  Saved: {output_filename}')
        
        except Exception as e:
            print(f'Error processing {img_filename}: {e}')
            continue
    
    print('\nDone!')

if __name__ == '__main__':
    generate_composites_for_all_angles()

