#!/usr/bin/env python3
"""
Emit a schema-only template for public/data/rt_model_haze_tau.json.

Fill ``models`` from the radiative-transfer code only — e.g. Python:
  model["layers"]["tau"]["haze"]   # per-layer optical depth
Map spectral channels 3, 68, 255 (~0.93, ~2.0, ~5.1 µm on the RT grid).

Keys under ``models`` must match UI scenario ids: doose_0.0, doose_0.5, doose_1.0,
tomasko_0.0, tomasko_0.5, tomasko_1.0. Adjust layer_boundaries_km / layer_center_km if
your model uses a different vertical grid.

Usage:
  python3 scripts/build_rt_model_haze_tau_json.py -o public/data/rt_model_haze_tau.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def centers_from_boundaries(km: list[float]) -> list[float]:
    out = []
    for i in range(len(km) - 1):
        out.append((km[i] + km[i + 1]) / 2.0)
    return [round(x, 6) for x in out]


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Write rt_model_haze_tau.json template (no fabricated tau values)"
    )
    ap.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("public/data/rt_model_haze_tau.json"),
    )
    args = ap.parse_args()

    boundaries = [0.0, 6.0, 12.0, 20.0, 32.0, 42.0, 50.0]
    centers = centers_from_boundaries(boundaries)

    doc = {
        "description": (
            "Per-layer haze optical depth from the RT model (layers.tau.haze). "
            "The models object is empty until you add the real export from the RT code."
        ),
        "schema": "models[scenario_id].tau_haze[channel_index][layer]; lengths must match layer_center_km",
        "channel_index_to_um_approx": {
            "3": 0.934,
            "68": 2.001,
            "255": 5.123,
        },
        "layer_boundaries_km": boundaries,
        "layer_center_km": centers,
        "models": {},
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2)
    print(f"Wrote template {args.output} (models empty — add RT export)")


if __name__ == "__main__":
    main()
