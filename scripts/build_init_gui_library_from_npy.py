#!/usr/bin/env python3
"""
Convert PI-provided 3rd_gui_library.npy into init_gui_library.json for the web app.

Expected array layout (last dim = wavelength, 256 bins):
  (n_albedo, n_inc, n_emi, n_case, n_az1, n_az2, n_wl)
  with n_case = 3 (standard, no_ch4, no_haze).

The app expects the "new" spectral JSON shape (see init_comp_library.json):
  inc, emi, daz (unique grids), wavelength, albedo list, data.albedo_*.{standard,no_ch4,no_haze}

Flat index matches src/utils/dataProcessing.js calculateFlatIndex:
  flat = inc_idx * (len(emi) * len(daz)) + emi_idx * len(daz) + az_idx
with az_idx = az1 * n_az2 + az2 (row-major over the 6×6 azimuth grid).

Axis-0 is mapped to surface albedos [0.1, 0.2] for keys albedo_0.1 and albedo_0.2.
If your PI uses a different axis order or albedo semantics, adjust LABELS below and re-run.

Usage (replace the --npy path with your real file; /path/to/... is not literal):
  python3 scripts/build_init_gui_library_from_npy.py \\
    --npy ~/Downloads/3rd_gui_library.npy \\
    --out public/assets/dt/tomasko_1.0/init_gui_library.json \\
    --wavelength-from public/assets/dt/tomasko_1.0/init_comp_library.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

CASE_KEYS = ("standard", "no_ch4", "no_haze")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--npy", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument(
        "--wavelength-from",
        type=Path,
        help="JSON file to copy wavelength grid from (default: init_comp next to --out)",
    )
    ap.add_argument(
        "--albedo",
        type=float,
        nargs="*",
        default=[0.1, 0.2],
        help="Albedo value per leading axis-0 index (default: 0.1 0.2)",
    )
    args = ap.parse_args()

    npy = args.npy.expanduser().resolve()
    if not npy.is_file():
        raise SystemExit(
            f"NPY file not found: {npy}\n"
            "Pass the real path to your .npy file after --npy "
            "(the docs use an example path, not a folder on your machine)."
        )

    arr = np.load(npy)
    if arr.ndim != 7:
        raise SystemExit(f"Expected 7-D array, got shape {arr.shape}")

    n_alb, n_inc, n_emi, n_case, n_az1, n_az2, n_wl = arr.shape
    if n_case != 3:
        raise SystemExit(f"Expected 3 case dimensions, got n_case={n_case}")
    if len(args.albedo) != n_alb:
        raise SystemExit(
            f"--albedo length ({len(args.albedo)}) must match axis-0 size ({n_alb})"
        )

    wl_path = args.wavelength_from
    if wl_path is None:
        wl_path = args.out.parent / "init_comp_library.json"
    with open(wl_path, encoding="utf-8") as f:
        comp = json.load(f)
    wavelength = comp["wavelength"]
    if len(wavelength) != n_wl:
        raise SystemExit(
            f"wavelength length {len(wavelength)} != npy last dim {n_wl}"
        )

    # Replace NaNs (sparse in sample file) with 0.0
    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)

    inc = [round(x, 6) for x in np.linspace(0.0, 90.0, n_inc)]
    emi = [round(x, 6) for x in np.linspace(0.0, 90.0, n_emi)]
    n_az = n_az1 * n_az2
    daz = [round(x, 6) for x in np.linspace(0.0, 180.0, n_az)]

    data: dict = {}
    for ai, alb in enumerate(args.albedo):
        key = f"albedo_{alb}"
        blocks: dict[str, list] = {k: [] for k in CASE_KEYS}
        for ci, ck in enumerate(CASE_KEYS):
            row: list[list[float]] = []
            for ii in range(n_inc):
                for ji in range(n_emi):
                    for az_flat in range(n_az):
                        az1 = az_flat // n_az2
                        az2 = az_flat % n_az2
                        spec = arr[ai, ii, ji, ci, az1, az2, :].astype(float)
                        row.append([float(x) for x in spec.tolist()])
            if len(row) != n_inc * n_emi * n_az:
                raise RuntimeError("internal length mismatch")
            blocks[ck] = row
        data[key] = blocks

    out_obj = {
        "inc": inc,
        "emi": emi,
        "daz": daz,
        "albedo": list(args.albedo),
        "wavelength": wavelength,
        "data": data,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out_obj, f, separators=(",", ":"))

    n_flat = n_inc * n_emi * n_az
    print(f"Wrote {args.out}")
    print(f"  shape {arr.shape} -> flat spectra per albedo/case: {n_flat}")
    print(f"  albedo keys: {list(data.keys())}")


if __name__ == "__main__":
    main()
