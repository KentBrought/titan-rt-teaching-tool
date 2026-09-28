import gzip
import json
import matplotlib.pyplot as plt

# 1. Path to your compressed dataset
file_path = "public/assets/dt/tomasko_1.0/4th_gui_library.json.gz"

print(f"Loading {file_path}...")
with gzip.open(file_path, "rt", encoding="utf-8") as f:
    data = json.load(f)

# 2. Extract scales and coordinates
haze_scale = data.get("haze_scale", [])
methane_scale = data.get("methane_scale", [])
wavelengths = data.get("wavelength", [])
spectra = data.get("spectra", [])

print("Available Haze scale:", haze_scale)
print("Available Methane scale:", methane_scale)

# 3. Target Haze = 0 (Index 0) and Methane = 0 (Index 0)
haze_idx = 0
methane_idx = 0
surf_idx = 0     # Surface class 0 (default/tholin)
inc_idx = 0      # First incidence angle
emi_idx = 0      # First emission angle
az_idx = 0       # First azimuth angle

# Extract the exact 1D curve
zero_atm_curve = spectra[haze_idx][methane_idx][surf_idx][inc_idx][emi_idx][az_idx]

print(f"Extracted {len(zero_atm_curve)} spectral points.")
print("First 5 values:", zero_atm_curve[:5])

# 4. Plot the curve
plt.figure(figsize=(9, 5))
plt.plot(wavelengths, zero_atm_curve, label=f"Haze={haze_scale[haze_idx]}, CH4={methane_scale[methane_idx]}")
plt.title("PyDISORT Spectrum: Haze=0, CH4=0 (No Atmosphere)")
plt.xlabel("Wavelength (μm)")
plt.ylabel("Apparent Reflectance")
plt.grid(True, linestyle="--", alpha=0.6)
plt.legend()
plt.tight_layout()
plt.show()