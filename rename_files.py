import os

# Set this to the base folder containing all your haze/methane subfolders
base_dir = r"D:\victo\Documents\titan-rt-teaching-tool\public\assets\dt"

# Walk through every subfolder and file
for root, dirs, files in os.walk(base_dir):
    
    # Get the name of the current folder (e.g., 'haze0methane0' or 'haze0_methane0')
    folder_name = os.path.basename(root)
    
    # Strip underscores just in case your folders have them but you want flat tags
    tag = folder_name.replace('_', '')
    
    for filename in files:
        # Check if the file uses the old 2012 format
        if filename.startswith('2012_A0.1_'):
            
            # Swap the old prefix for the new runsforgui prefix
            new_filename = filename.replace('2012_A0.1_', f'runsforgui_{tag}_')
            
            old_path = os.path.join(root, filename)
            new_path = os.path.join(root, new_filename)
            
            # Rename the file
            os.rename(old_path, new_path)
            print(f"Renamed: {filename}  ->  {new_filename}")

print("\nBulk rename complete!")