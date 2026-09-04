#!/usr/bin/env python3
"""
Convert GUI NPY spectral library into JSON consumed by the web app.

Expected shape:
  (5, 5, 3, 6, 6, 7, n_wavelength)
Axes:
  [haze_scale, methane_scale, surface_class, incidence, emission, azimuth, wavelength]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--npy", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--wavelength-from", type=Path, required=True)
    args = ap.parse_args()

    npy_path = args.npy.expanduser().resolve()
    if not npy_path.is_file():
        raise SystemExit(f"NPY file not found: {npy_path}")

    arr = np.load(npy_path)
    if arr.ndim != 7:
        raise SystemExit(f"Expected 7-D array, got shape {arr.shape}")

    expected_prefix = (5, 5, 3, 6, 6, 7)
    if tuple(arr.shape[:6]) != expected_prefix:
        raise SystemExit(
            f"Expected leading shape {expected_prefix}, got {arr.shape[:6]}"
        )

    wl_src = args.wavelength_from.expanduser().resolve()
    with open(wl_src, encoding="utf-8") as f:
        wl_json = json.load(f)
    wavelength = wl_json.get("wavelength")
    if not isinstance(wavelength, list):
        raise SystemExit("wavelength source JSON missing list field 'wavelength'")
    if len(wavelength) != arr.shape[-1]:
        raise SystemExit(
            f"wavelength length {len(wavelength)} != npy last dim {arr.shape[-1]}"
        )

    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)

    payload = {
        "format": "gui_v3",
        "haze_scale": [0.0, 0.25, 0.5, 0.75, 1.0],
        "methane_scale": [0.0, 0.5, 1.0, 1.5, 2.0],
        "surface_class": [0, 1, 2],
        "inc": [0, 15, 30, 45, 60, 75],
        "emi": [0, 15, 30, 45, 60, 75],
        "azimuth": [0, 30, 60, 90, 120, 150, 180],
        "wavelength": wavelength,
        "spectra": arr.tolist(),
    }

    out_path = args.out.expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    print(f"Wrote {out_path}")
    print(f"  spectra shape: {arr.shape}")


if __name__ == "__main__":
    main()
