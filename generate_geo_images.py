"""
Temporary script to generate grayscale images from geo cube files.
This script reads the .img files and creates grayscale images for incidence, emission, and phase values.
"""

import numpy as np
from PIL import Image
import os
import struct

def read_geo_cube(img_path):
    """
    Read a geo cube .img file and return the 9 layers as a numpy array.
    
    Structure: 9 bands, 681 lines, 681 samples
    Layers: 0=lat, 1=lon, 2=xres, 3=yres, 4=phase, 5=incidence, 6=emis, 7=azimuth, 8=distance
    """
    with open(img_path, 'rb') as f:
        # Read all data as bytes
        data = f.read()
    
    # Parse as 32-bit floats (little-endian)
    num_bands = 9
    num_lines = 681
    num_samples = 681
    total_elements = num_bands * num_lines * num_samples
    
    # Convert bytes to float32 array
    floats = struct.unpack(f'<{total_elements}f', data[:total_elements * 4])
    
    # Reshape to [band][line][sample] order
    # Data is stored as [band][line][sample] with sample changing fastest
    image_data = np.array(floats).reshape((num_bands, num_lines, num_samples))
    
    return image_data

def normalize_layer(layer_data, use_minmax=False):
    """
    Normalize a layer to 0-255 range for display.
    Uses percentile-based normalization to handle outliers by default.
    For phase data, uses min/max normalization since values should vary across the image.
    """
    # Remove invalid values (NaN, Inf)
    valid_data = layer_data[np.isfinite(layer_data)]
    
    if len(valid_data) == 0:
        return np.zeros_like(layer_data, dtype=np.uint8)
    
    if use_minmax:
        # Use min/max normalization (better for phase data)
        data_min = np.min(valid_data)
        data_max = np.max(valid_data)
        
        if data_max == data_min:
            # All values are the same - return a mid-gray image instead of black
            return np.full_like(layer_data, 128, dtype=np.uint8)
        
        # Normalize to 0-1 range
        normalized = (layer_data - data_min) / (data_max - data_min)
    else:
        # Use percentile-based normalization (2nd to 98th percentile) for incidence/emission
        p2 = np.percentile(valid_data, 2)
        p98 = np.percentile(valid_data, 98)
        
        if p98 == p2:
            # All values are the same - return a mid-gray image instead of black
            return np.full_like(layer_data, 128, dtype=np.uint8)
        
        # Normalize to 0-1 range
        normalized = (layer_data - p2) / (p98 - p2)
    
    # Clip to [0, 1] and convert to 0-255
    normalized = np.clip(normalized, 0, 1)
    return (normalized * 255).astype(np.uint8)

def create_grayscale_image(geo_data, layer_idx, layer_name='', phase_angle=None):
    """
    Create a grayscale image from a specific layer.
    
    Args:
        geo_data: 3D numpy array [9, 681, 681]
        layer_idx: Index of layer to extract (4=phase, 5=incidence, 6=emission)
        layer_name: Name of the layer for debugging
        phase_angle: Phase angle in degrees (for phase layer uniform circle)
    
    Returns:
        PIL Image with grayscale image
    """
    # Extract the layer
    layer_data = geo_data[layer_idx]
    
    # Special handling for phase: uniform circle with shade based on phase angle
    if layer_name == 'phase':
        # Create output array initialized to black (0)
        output = np.zeros_like(layer_data, dtype=np.uint8)
        
        # Find valid (finite) values - these are the planet pixels
        valid_mask = np.isfinite(layer_data)
        
        if np.any(valid_mask) and phase_angle is not None:
            # Map phase angle (0-360) to grayscale (0-255)
            # Phase angle is already in degrees, map directly: phase_angle / 360 * 255
            gray_value = int((phase_angle / 360.0) * 255)
            gray_value = max(0, min(255, gray_value))  # Clamp to valid range
            
            # Set all valid pixels to the same shade
            output[valid_mask] = gray_value
            print(f'    Phase: {np.sum(valid_mask)} valid pixels, uniform shade {gray_value} (phase angle {phase_angle}°)')
        else:
            print(f'    Phase: No valid pixels found or phase_angle not provided')
        
        return Image.fromarray(output, 'L')
    
    # For incidence and emission, use standard normalization
    # Normalize the layer
    grayscale = normalize_layer(layer_data, use_minmax=False)
    
    # Create PIL Image (grayscale)
    return Image.fromarray(grayscale, 'L')

def generate_geo_images_for_all_angles():
    """
    Generate grayscale images for all phase angles (0-355 in 5-degree increments).
    Creates images for incidence (layer 5), emission (layer 6), and phase (layer 4).
    """
    base_dir = 'public/assets/dt/tomasko_1.0'
    output_dir = 'public/assets/dt/tomasko_1.0'
    
    # Phase angles from 0 to 355 in 5-degree increments
    phase_angles = range(0, 360, 5)
    
    # Layer mappings
    layers = {
        'incidence': 5,  # Layer 5: incidence (Deg)
        'emission': 6,   # Layer 6: emis (Deg)
        'phase': 4       # Layer 4: phase (Deg)
    }
    
    for phase_angle in phase_angles:
        padded_phase = f'{phase_angle:03d}'
        img_filename = f'2012_A0.1_p{padded_phase}_geo.img'
        img_path = os.path.join(base_dir, img_filename)
        
        if not os.path.exists(img_path):
            print(f'Warning: {img_path} not found, skipping...')
            continue
        
        print(f'Processing phase angle {phase_angle}°...')
        
        try:
            # Read geo cube
            geo_data = read_geo_cube(img_path)
            
            # Generate grayscale images for each layer type
            for layer_name, layer_idx in layers.items():
                grayscale_img = create_grayscale_image(geo_data, layer_idx, layer_name=layer_name, phase_angle=phase_angle)
                
                # Save with naming convention: 2012_A0.1_p{phase}_{layer_name}.png
                output_filename = f'2012_A0.1_p{padded_phase}_{layer_name}.png'
                output_path = os.path.join(output_dir, output_filename)
                grayscale_img.save(output_path)
                print(f'  Saved: {output_filename}')
        
        except Exception as e:
            print(f'Error processing {img_filename}: {e}')
            continue
    
    print('\nDone!')

if __name__ == '__main__':
    generate_geo_images_for_all_angles()

