#!/usr/bin/env python3
"""Convert HASI L4 ASCII profile (semicolon-separated) to JSON for the web app.

Columns: time (ignored), altitude (m), pressure (Pa), temperature (K), density (kg/m^3).
Output is sorted by altitude ascending (surface → top) for plotting y = altitude km.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser(description="HASI .TAB → hasi_atmosphere_profile.json")
    ap.add_argument("input_tab", type=Path, help="Path to HASI_L4_ATMO_PROFILE_COMPLETE.TAB")
    ap.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("public/data/hasi_atmosphere_profile.json"),
        help="Output JSON path (default: public/data/hasi_atmosphere_profile.json)",
    )
    args = ap.parse_args()

    rows: list[tuple[float, float, float, float, float]] = []
    with open(args.input_tab, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split(";")
            if len(parts) < 5:
                continue
            t, z_m, p, t_k, rho = (float(parts[i]) for i in range(5))
            rows.append((t, z_m, p, t_k, rho))

    rows.sort(key=lambda r: r[1])
    altitude_m = [r[1] for r in rows]
    altitude_km = [z / 1000.0 for z in altitude_m]
    out = {
        "description": "Huygens HASI L4 atmospheric profile: T, P, and density vs altitude above surface.",
        "source_file": args.input_tab.name,
        "altitude_m": altitude_m,
        "altitude_km": altitude_km,
        "pressure_Pa": [r[2] for r in rows],
        "temperature_K": [r[3] for r in rows],
        "density_kg_m3": [r[4] for r in rows],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Wrote {len(rows)} levels to {args.output}")


if __name__ == "__main__":
    main()
