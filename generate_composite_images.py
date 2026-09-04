"""
Temporary script to generate composite RGB images from CCD color image layers.
"""

import numpy as np
from PIL import Image
import os
import struct

def read_ccd_image(img_path):
    """
    Read a CCD .img file and return the 15 layers as a numpy array.
    Structure: 15 bands, 641 lines, 641 samples
    """
    with open(img_path, 'rb') as f:
        data = f.read()
    
    num_bands = 15
    num_lines = 641
    num_samples = 641
    total_elements = num_bands * num_lines * num_samples
    
    floats = struct.unpack(f'<{total_elements}f', data[:total_elements * 4])
    image_data = np.array(floats).reshape((num_bands, num_lines, num_samples))
    
    return image_data

def normalize_layer(layer_data, method='logarithmic'):
    """
    Normalize a single layer to 0-255 range independently.
    Supports 'percentile', 'logarithmic', and 'gamma' to enhance image details.
    """
    valid_data = layer_data[np.isfinite(layer_data)]
    if len(valid_data) == 0:
        return np.zeros_like(layer_data, dtype=np.uint8)
        
    if method == 'logarithmic':
        # 1. Shift to positive domain and take log to compress bright haze highlights
        min_val = np.min(valid_data)
        log_data = np.log10(layer_data - min_val + 1.0)
        
        p2 = np.percentile(log_data[np.isfinite(log_data)], 2)
        p98 = np.percentile(log_data[np.isfinite(log_data)], 98)
        normalized = (log_data - p2) / (p98 - p2) if p98 != p2 else np.zeros_like(log_data)
        
    elif method == 'gamma':
        # 2. Power-law scaling (Gamma = 0.5 pulls up surface details out of shadows)
        p2 = np.percentile(valid_data, 2)
        p98 = np.percentile(valid_data, 98)
        normalized = (layer_data - p2) / (p98 - p2) if p98 != p2 else np.zeros_like(layer_data)
        normalized = np.clip(normalized, 0, 1)
        normalized = np.power(normalized, 0.5) # Gamma tuning adjustment
        
    else:
        # 3. Your original standard linear percentile stretch
        p2 = np.percentile(valid_data, 2)
        p98 = np.percentile(valid_data, 98)
        normalized = (layer_data - p2) / (p98 - p2) if p98 != p2 else np.zeros_like(layer_data)
        
    normalized = np.clip(normalized, 0, 1)
    return (normalized * 255).astype(np.uint8)

def create_composite(ccd_data, red_layer_idx, green_layer_idx, blue_layer_idx, method='logarithmic'):
    """
    Create an RGB composite image from specified layers, normalizing each layer independently.
    """
    red = normalize_layer(ccd_data[red_layer_idx], method=method)
    green = normalize_layer(ccd_data[green_layer_idx], method=method)
    blue = normalize_layer(ccd_data[blue_layer_idx], method=method)
    
    rgb_array = np.stack([red, green, blue], axis=-1)
    return Image.fromarray(rgb_array, 'RGB')

def generate_composites_for_all_angles():
    """
    Generate composite images for all phase angles across all 9 matrix folders dynamically.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_raw_dir = os.path.join(script_dir, 'public', 'assets', 'raw')
    base_frontend_dir = os.path.join(script_dir, 'public', 'assets', 'dt')
    
    phase_angles = range(0, 185, 15)
    
    composites = {
        '5_2_1.3': {'red': 14, 'green': 8, 'blue': 4},
        '2_1.6_1.3': {'red': 8, 'green': 6, 'blue': 4}
    }
    
    # CHOOSE METHOD: Try 'percentile', 'logarithmic', or 'gamma' to see what looks best!
    normalization_method = 'percentile'
    
    haze_levels = ['0', '0.5', '1']
    methane_levels = ['0', '0.5', '1']
    
    for h in haze_levels:
        for m in methane_levels:
            raw_folder = f"haze{h}methane{m}"
            
            # The directory where your new .img files are (and where PNGs will now be saved)
            base_dir = os.path.join(base_raw_dir, raw_folder)
            
            if not os.path.exists(base_dir):
                continue
                
            print(f"\n=== Processing Matrix Folder: {raw_folder} ===")
    
            for phase_angle in phase_angles:
                padded_phase = f'{phase_angle:03d}'
                
                # 1. READ THE NEW FILENAME FORMAT
                img_filename = f'runsforgui_{raw_folder}_p{padded_phase}_colorCCD.img'
                img_path = os.path.join(base_dir, img_filename)
                
                if not os.path.exists(img_path):
                    continue
                
                try:
                    ccd_data = read_ccd_image(img_path)
                    
                    for comp_key, comp_config in composites.items():
                        composite_img = create_composite(
                            ccd_data,
                            comp_config['red'],
                            comp_config['green'],
                            comp_config['blue'],
                            method=normalization_method
                        )
                        
                        # 2. OUTPUT THE NEW STANDARDIZED FILENAME FORMAT
                        output_filename = f'runsforgui_{raw_folder}_p{padded_phase}_{comp_key}.png'
                        
                        # 3. SAVE DIRECTLY TO THE 'RAW' FOLDER (base_dir)
                        output_path = os.path.join(base_dir, output_filename)
                        composite_img.save(output_path)
                        print(f'    Saved: {output_filename}')
                
                except Exception as e:
                    print(f'  Error processing {img_filename}: {e}')
                    continue
    
    print('\nDone!')

if __name__ == '__main__':
    generate_composites_for_all_angles()