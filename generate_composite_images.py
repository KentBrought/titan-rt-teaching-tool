"""
Temporary script to generate composite RGB images from CCD color image layers.
"""

import numpy as np
from PIL import Image
import os

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
    
    # Fast binary read directly into numpy array
    image_data = np.frombuffer(data, dtype='<f4')[:total_elements]
    return image_data.reshape((num_bands, num_lines, num_samples))

def normalize_layer(layer_data, method='percentile'):
    """
    Normalize a single layer to 0-255 range independently.
    Supports 'percentile', 'logarithmic', and 'gamma' to enhance image details.
    """
    valid_data = layer_data[np.isfinite(layer_data)]
    if len(valid_data) == 0:
        return np.zeros_like(layer_data, dtype=np.uint8)
        
    if method == 'logarithmic':
        min_val = np.min(valid_data)
        log_data = np.log10(layer_data - min_val + 1.0)
        p2 = np.percentile(log_data[np.isfinite(log_data)], 2)
        p98 = np.percentile(log_data[np.isfinite(log_data)], 98)
        normalized = (log_data - p2) / (p98 - p2) if p98 != p2 else np.zeros_like(log_data)
        
    elif method == 'gamma':
        p2 = np.percentile(valid_data, 2)
        p98 = np.percentile(valid_data, 98)
        normalized = (layer_data - p2) / (p98 - p2) if p98 != p2 else np.zeros_like(layer_data)
        normalized = np.clip(normalized, 0, 1)
        normalized = np.power(normalized, 0.5)
        
    else:
        p2 = np.percentile(valid_data, 2)
        p98 = np.percentile(valid_data, 98)
        normalized = (layer_data - p2) / (p98 - p2) if p98 != p2 else np.zeros_like(layer_data)
        
    normalized = np.clip(normalized, 0, 1)
    return (normalized * 255).astype(np.uint8)

def create_composite(ccd_data, red_layer_idx, green_layer_idx, blue_layer_idx, method='percentile'):
    """
    Create an RGB composite image from specified layers, normalizing each layer independently.
    """
    red = normalize_layer(ccd_data[red_layer_idx], method=method)
    green = normalize_layer(ccd_data[green_layer_idx], method=method)
    blue = normalize_layer(ccd_data[blue_layer_idx], method=method)
    
    rgb_array = np.stack([red, green, blue], axis=-1)
    return Image.fromarray(rgb_array, 'RGB')

def generate_composites_for_all_angles():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dt_dir = os.path.join(script_dir, 'public', 'assets', 'dt')
    
    phase_angles = range(0, 185, 15)
    
    composites = {
        # Cloud-detection: RGB = 2.2, 2.1, 2.0 um
        '2.2_2.1_2.0': {'red': 10, 'green': 9, 'blue': 8},
        
        # Haze 1: RGB = 2.4, 1.7, 1.2 um (bands 2.39, 1.70, 1.21 um)
        '2.4_1.7_1.2': {'red': 11, 'green': 7, 'blue': 3},
        
        # Haze 2: RGB = 1.4, 1.2, 1.0 um (bands 1.39, 1.21, 1.00 um)
        '1.4_1.2_1.0': {'red': 5, 'green': 3, 'blue': 1}
    }
    
    normalization_method = 'percentile'
    
    haze_levels = ['0', '0.5', '1']
    methane_levels = ['0', '0.5', '1']
    
    for h in haze_levels:
        for m in methane_levels:
            folder_name = f"haze{h}_methane{m}"
            dt_dir = os.path.join(base_dt_dir, folder_name)
            
            if not os.path.exists(dt_dir):
                continue
                
            tag = f"haze{h}methane{m}"
            print(f"\n=== Processing Folder: {folder_name} ===")
    
            for phase_angle in phase_angles:
                padded_phase = f'{phase_angle:03d}'
                
                img_filename = f'runsforgui_{tag}_p{padded_phase}_colorCCD.img'
                img_path = os.path.join(dt_dir, img_filename)
                
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
                        
                        output_filename = f'runsforgui_{tag}_p{padded_phase}_{comp_key}.png'
                        output_path = os.path.join(dt_dir, output_filename)
                        composite_img.save(output_path)
                        print(f'    Saved: {output_filename}')
                
                except Exception as e:
                    print(f'  Error processing {img_filename}: {e}')
                    continue

    print("\nAll composite images generated successfully!")

if __name__ == '__main__':
    generate_composites_for_all_angles()