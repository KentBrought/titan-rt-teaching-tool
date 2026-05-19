#!/usr/bin/env python3
"""
Copy fresh RT PDS4 assets from a Downloads tree into public/assets/dt/<canonical>/,
while preserving existing composite PNGs already in the repo.

Typical workflow (paths are examples — adjust SOURCE_ROOT):

  python3 scripts/merge_rt_downloads_into_dt_assets.py \\
    --source ~/Downloads/haze1methane1_new \\
    --target public/assets/dt/haze1_methane1

Suggested pairs (Doose canonical folders under ``public/assets/dt/``):

  haze0methane1_new      -> haze0_methane1
  haze0.5methane1_new    -> haze0.5_methane1
  haze1methane1_new      -> haze1_methane1
  haze1methane25_new     -> haze1_methane0.25   (``runsforgui_haze1methane0_*`` renames)

Behavior:
1. Moves every *.png in TARGET to a temporary directory (stash).
2. Copies all files from SOURCE into TARGET, applying optional renames.
3. Moves stashed PNGs back into TARGET (restores display composites).

Rename rule for legacy ``runsforgui_*`` names::

  runsforgui_<anything>_pNNN_<suffix>  ->  2012_A0.1_pNNN_<suffix>

Files whose destination name contains ``npole`` are skipped (duplicate pole tiles).
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
import tempfile
from pathlib import Path


RUNSFORGUI_RE = re.compile(r"^runsforgui_.+?_p(\d{3})(_.+)$", re.IGNORECASE)


def dest_basename(name: str) -> str | None:
    m = RUNSFORGUI_RE.match(name)
    if m:
        return f"2012_A0.1_p{m.group(1)}{m.group(2)}"
    return name


def merge(source: Path, target: Path, dry_run: bool) -> None:
    if not source.is_dir():
        print(f"ERROR: source is not a directory: {source}", file=sys.stderr)
        sys.exit(1)
    if not target.is_dir():
        print(f"ERROR: target is not a directory: {target}", file=sys.stderr)
        sys.exit(2)

    pngs = sorted(target.glob("*.png"))
    stash: Path | None = None
    if pngs and not dry_run:
        stash = Path(tempfile.mkdtemp(prefix="dt_png_stash_"))
        for p in pngs:
            shutil.move(str(p), str(stash / p.name))
        print(f"Stashed {len(pngs)} PNG(s) -> {stash}")
    elif pngs:
        print(f"[dry-run] would stash {len(pngs)} PNG(s)")

    copied = 0
    skipped = 0
    for src_file in sorted(source.rglob("*")):
        if src_file.is_dir():
            continue
        rel = src_file.relative_to(source)
        parts = list(rel.parts)
        if not parts:
            continue
        new_name = dest_basename(parts[-1])
        if "npole" in new_name.lower():
            skipped += 1
            continue
        parts[-1] = new_name
        dest = target.joinpath(*parts)
        if dry_run:
            print(f"  copy {src_file} -> {dest}")
            copied += 1
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_file, dest)
        copied += 1

    if stash and not dry_run:
        restored = 0
        for p in sorted(stash.glob("*.png")):
            shutil.move(str(p), str(target / p.name))
            restored += 1
        shutil.rmtree(stash, ignore_errors=True)
        print(f"Restored {restored} PNG(s) into {target}")
    elif pngs and dry_run:
        print(f"[dry-run] would restore stashed PNGs into {target}")

    print(f"Done. copied={copied} skipped_npole_or_bad={skipped}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, required=True, help="Downloaded RT folder (recursive copy)")
    ap.add_argument("--target", type=Path, required=True, help="Canonical repo folder under public/assets/dt/")
    ap.add_argument("--dry-run", action="store_true", help="Print actions only")
    args = ap.parse_args()
    merge(args.source.expanduser().resolve(), args.target.resolve(), args.dry_run)


if __name__ == "__main__":
    main()
