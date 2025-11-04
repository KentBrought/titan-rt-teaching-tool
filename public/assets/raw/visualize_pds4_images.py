#!/usr/bin/env python3
"""Simple Tkinter-based viewer for PDS4 image products.
"""
from __future__ import annotations

import argparse
from itertools import permutations
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from xml.etree import ElementTree as ET

import tkinter as tk
from tkinter import messagebox, ttk

try:
    from PIL import Image, ImageTk
except ImportError as exc:  # pragma: no cover - defensive check
    raise SystemExit(
        "Pillow is required to run this viewer. Install it with `pip install pillow`."
    ) from exc

try:
    from pds4_tools import pds4_read
except ImportError as exc:  # pragma: no cover - defensive check
    raise SystemExit(
        "pds4_tools is required to run this viewer. Install it with `pip install pds4-tools`."
    ) from exc

import numpy as np


ARRAY_ELEMENT_TAGS: Tuple[str, ...] = (
    "Array_3D_Spectrum",
    "Array_3D_Image",
    "Array_3D",
    "Array_2D_Image",
    "Array_2D",
    "Array",
)

_CHANNEL_KEYWORDS: Tuple[str, ...] = (
    "band",
    "spectral",
    "wavelength",
    "color",
    "colour",
    "channel",
)

_SPATIAL_KEYWORDS: Tuple[str, ...] = (
    "line",
    "sample",
    "row",
    "column",
    "col",
    "x",
    "y",
)


def extract_axis_names(label_path: Path, target_shape: Optional[Tuple[int, ...]] = None) -> List[str]:
    """Extract axis names from the first array object in ``label_path``."""

    try:
        tree = ET.parse(label_path)
    except (ET.ParseError, OSError):
        return []

    root = tree.getroot()
    candidates: List[Tuple[List[str], List[Optional[int]]]] = []
    for tag in ARRAY_ELEMENT_TAGS:
        for array_elem in root.findall(f".//{{*}}{tag}"):
            axis_entries: List[Tuple[Optional[int], str, Optional[int]]] = []
            for axis_elem in array_elem.findall("{*}Axis_Array"):
                name = axis_elem.findtext("{*}axis_name")
                if not name:
                    continue

                seq_text = axis_elem.findtext("{*}sequence_number")
                elements_text = axis_elem.findtext("{*}elements")

                if seq_text is None:
                    seq_value: Optional[int] = None
                else:
                    try:
                        seq_value = int(seq_text)
                    except ValueError:
                        seq_value = None

                if elements_text is None:
                    length_value: Optional[int] = None
                else:
                    try:
                        length_value = int(elements_text)
                    except ValueError:
                        length_value = None

                axis_entries.append((seq_value, name.strip(), length_value))

            if not axis_entries:
                continue

            axis_entries.sort(key=lambda item: (item[0] is None, item[0]))
            names = [item[1] for item in axis_entries]
            lengths = [item[2] for item in axis_entries]
            candidates.append((names, lengths))

    if not candidates:
        return []

    if target_shape is not None:
        target_shape_tuple = tuple(int(dim) for dim in target_shape)
        for names, lengths in candidates:
            matched = _match_axis_order(names, lengths, target_shape_tuple)
            if matched:
                return matched

    return candidates[0][0]


def _match_axis_order(
    names: List[str], lengths: List[Optional[int]], target_shape: Tuple[int, ...]
) -> Optional[List[str]]:
    """Return ``names`` reordered to match ``target_shape`` if possible."""

    if len(names) != len(target_shape):
        return None

    indices = list(range(len(names)))
    for perm in permutations(indices):
        valid = True
        for dim_index, axis_index in enumerate(perm):
            length = lengths[axis_index]
            if length is None:
                continue
            if length != target_shape[dim_index]:
                valid = False
                break
        if valid:
            return [names[idx] for idx in perm]

    return None


def _infer_channel_axis(shape: Tuple[int, ...], axis_names: Optional[List[str]]) -> int:
    """Infer which axis in ``shape`` represents colour or spectral channels."""

    if axis_names:
        lowered = [name.lower() for name in axis_names]
        for idx, name in enumerate(lowered):
            if any(keyword in name for keyword in _CHANNEL_KEYWORDS):
                return idx

        for idx, name in enumerate(lowered):
            if any(keyword == name or keyword in name for keyword in _SPATIAL_KEYWORDS):
                continue
            return idx

    for idx, size in enumerate(shape):
        if size in (1, 2, 3, 4):
            return idx

    smallest_index = int(np.argmin(shape))
    return smallest_index


def _select_representative_indices(channel_count: int) -> List[int]:
    """Choose three evenly spaced indices from ``channel_count`` channels."""

    if channel_count <= 3:
        return list(range(channel_count))

    linspace = np.linspace(0, channel_count - 1, num=3)
    indices: List[int] = []
    for value in linspace:
        idx = int(round(float(value)))
        idx = max(0, min(channel_count - 1, idx))
        if idx not in indices:
            indices.append(idx)

    if len(indices) < 3:
        for idx in range(channel_count):
            if idx not in indices:
                indices.append(idx)
            if len(indices) == 3:
                break

    return indices[:3]


def discover_label_files(directory: Path, pattern: str = "*.xml") -> List[Path]:
    """Return sorted list of PDS4 label files that match ``pattern``."""
    labels = sorted(directory.glob(pattern))
    return [path for path in labels if path.is_file()]


def _scale_single_channel(channel: np.ndarray) -> np.ndarray:
    """Normalise a single image channel to the 0-255 range."""
    channel = np.asarray(channel, dtype=np.float64)
    finite_mask = np.isfinite(channel)
    if not finite_mask.any():
        return np.zeros(channel.shape, dtype=np.uint8)

    finite_values = channel[finite_mask]
    min_val = float(finite_values.min())
    max_val = float(finite_values.max())

    if np.isclose(min_val, max_val):
        scaled = np.zeros(channel.shape, dtype=np.uint8)
        scaled[finite_mask] = np.clip(np.round(finite_values - min_val), 0, 255).astype(
            np.uint8
        )
        return scaled

    normalised = (channel - min_val) / (max_val - min_val)
    normalised[~finite_mask] = 0.0
    scaled = np.clip(np.round(normalised * 255.0), 0, 255).astype(np.uint8)
    return scaled


def prepare_display_array(
    array: np.ndarray, axis_names: Optional[Iterable[str]] = None
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """Convert raw PDS4 array data into an 8-bit image array.

    Parameters
    ----------
    array
        The raw array read from a PDS4 data structure.
    axis_names
        Optional iterable of axis names corresponding to ``array``.

    Returns
    -------
    tuple
        ``(display_array, info)`` where ``display_array`` is an unsigned
        8-bit numpy array suitable for display, and ``info`` contains metadata
        describing how the array was interpreted.
    """

    data = np.asarray(array)
    original_names = list(axis_names) if axis_names is not None else None
    info: Dict[str, Any] = {
        "axis_names": original_names,
        "effective_axis_names": None,
        "channel_axis_index": None,
        "channel_axis_name": None,
        "channel_count": None,
        "display_channels": None,
        "display_mode": None,
    }

    names = None
    if original_names is not None and len(original_names) == data.ndim:
        names = list(original_names)

    squeeze_axes = [idx for idx, size in enumerate(data.shape) if size == 1]
    data = np.squeeze(data)
    if names:
        for axis in reversed(squeeze_axes):
            if axis < len(names):
                names.pop(axis)

    while data.ndim > 3:
        data = data[0]
        if names:
            names.pop(0)

    if data.ndim == 1:
        data = data[np.newaxis, :]
        if names:
            names = [names[-1]]
        scaled = _scale_single_channel(data)
        info["effective_axis_names"] = names
        info["channel_count"] = 1
        info["display_channels"] = [0]
        info["display_mode"] = "L"
        return scaled, info

    if data.ndim == 2:
        scaled = _scale_single_channel(data)
        info["effective_axis_names"] = names
        info["channel_count"] = 1
        info["display_channels"] = [0]
        info["display_mode"] = "L"
        return scaled, info

    # Three-dimensional data: interpret one axis as colour/spectral channels.
    inferred_names = names if names is not None else None
    channel_axis = _infer_channel_axis(data.shape, inferred_names)
    info["channel_axis_index"] = channel_axis
    if inferred_names and 0 <= channel_axis < len(inferred_names):
        info["channel_axis_name"] = inferred_names[channel_axis]

    if channel_axis != 2:
        data = np.moveaxis(data, channel_axis, 2)
        if names:
            channel_name = names.pop(channel_axis)
            names.append(channel_name)

    info["effective_axis_names"] = names
    info["channel_count"] = int(data.shape[2])

    channels = [_scale_single_channel(data[..., idx]) for idx in range(data.shape[2])]
    scaled_stack = np.stack(channels, axis=2)

    channel_count = scaled_stack.shape[2]
    if channel_count == 1:
        info["display_mode"] = "L"
        info["display_channels"] = [0]
        return scaled_stack[..., 0], info
    if channel_count == 2:
        info["display_mode"] = "RGB"
        info["display_channels"] = [0, 1, 1]
        composite = np.stack(
            [scaled_stack[..., 0], scaled_stack[..., 1], scaled_stack[..., 1]], axis=2
        )
        return composite, info
    if channel_count == 3:
        info["display_mode"] = "RGB"
        info["display_channels"] = [0, 1, 2]
        return scaled_stack, info
    if channel_count == 4:
        info["display_mode"] = "RGB"
        info["display_channels"] = [0, 1, 2]
        return scaled_stack[..., :3], info

    indices = _select_representative_indices(channel_count)
    info["display_mode"] = "RGB"
    info["display_channels"] = indices
    composite = np.stack([scaled_stack[..., idx] for idx in indices], axis=2)
    return composite, info


def array_to_image(array: np.ndarray) -> Image.Image:
    """Create a :class:`~PIL.Image.Image` instance from a numpy array."""
    if array.ndim == 2:
        mode = "L"
        payload = array
    elif array.ndim == 3:
        channels = array.shape[2]
        if channels == 3:
            mode = "RGB"
            payload = array
        elif channels == 4:
            mode = "RGBA"
            payload = array
        elif channels == 1:
            mode = "L"
            payload = array[..., 0]
        else:
            mode = "RGB"
            payload = array[..., :3]
    else:  # pragma: no cover - defensive fallback
        raise ValueError("Unsupported array shape for image conversion: %s" % (array.shape,))

    return Image.fromarray(payload)


def load_image_from_label(label_path: Path) -> Tuple[Image.Image, str]:
    """Load the first array structure from ``label_path`` and convert to an image."""
    structures = pds4_read(str(label_path))
    dataset = next((item for item in structures if hasattr(item, "data")), None)
    if dataset is None:
        raise ValueError(f"No array data found in {label_path.name}.")

    raw_array = np.asarray(dataset.data)
    axis_names = extract_axis_names(label_path, raw_array.shape)
    display_array, display_info = prepare_display_array(raw_array, axis_names)
    image = array_to_image(display_array)

    description = None
    if hasattr(dataset, "meta_data"):
        description = dataset.meta_data.get("description")

    metadata_lines = [
        f"File: {label_path.name}",
        f"Original data shape: {tuple(raw_array.shape)}",
        f"Display array shape: {tuple(display_array.shape)}",
        f"Data type: {raw_array.dtype}",
    ]
    if description:
        metadata_lines.append(f"Description: {description}")

    if axis_names:
        metadata_lines.append("Axis order (label): " + ", ".join(axis_names))

    effective_axes = display_info.get("effective_axis_names")
    if effective_axes and (not axis_names or effective_axes != axis_names):
        metadata_lines.append("Interpreted axis order: " + ", ".join(effective_axes))

    channel_name = display_info.get("channel_axis_name")
    channel_index = display_info.get("channel_axis_index")
    channel_count = display_info.get("channel_count")
    display_mode = display_info.get("display_mode")
    display_channels = display_info.get("display_channels")

    if channel_name is not None and channel_index is not None:
        metadata_lines.append(
            f"Channel axis: {channel_name} (index {channel_index}) with {channel_count} values"
        )

    if channel_count == 1:
        metadata_lines.append("Displayed as single-channel grayscale.")
    elif channel_count:
        if display_channels:
            formatted = ", ".join(str(idx) for idx in display_channels)
            metadata_lines.append(
                f"Displayed in {display_mode or 'RGB'} using source channel indices [{formatted}]."
            )
        else:
            metadata_lines.append(f"Displayed in {display_mode or 'RGB'} using all source channels.")

    return image, "\n".join(metadata_lines)


class PDS4ImageViewer(tk.Tk):
    """Tkinter window that presents a list of PDS4 images to browse."""

    def __init__(self, label_paths: Iterable[Path]):
        super().__init__()
        self.title("PDS4 Image Viewer")
        self.minsize(800, 600)

        self._label_paths: List[Path] = list(label_paths)
        self._image_cache: Dict[Path, Image.Image] = {}
        self._metadata_cache: Dict[Path, str] = {}
        self._photo_image: Optional[ImageTk.PhotoImage] = None
        self._info_var = tk.StringVar(value="Select a label to display the image.")

        self._build_ui()

    # ------------------------------------------------------------------
    # UI construction helpers
    # ------------------------------------------------------------------
    def _build_ui(self) -> None:
        self.columnconfigure(1, weight=1)
        self.rowconfigure(0, weight=1)

        list_frame = ttk.Frame(self, padding=5)
        list_frame.grid(row=0, column=0, sticky="ns")

        scrollbar = ttk.Scrollbar(list_frame, orient="vertical")
        self._listbox = tk.Listbox(
            list_frame,
            width=40,
            exportselection=False,
            yscrollcommand=scrollbar.set,
        )
        scrollbar.config(command=self._listbox.yview)
        self._listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        for path in self._label_paths:
            self._listbox.insert(tk.END, path.name)

        self._listbox.bind("<<ListboxSelect>>", self._on_select)

        content_frame = ttk.Frame(self, padding=5)
        content_frame.grid(row=0, column=1, sticky="nsew")
        content_frame.columnconfigure(0, weight=1)
        content_frame.rowconfigure(0, weight=1)

        self._image_label = ttk.Label(content_frame)
        self._image_label.grid(row=0, column=0, sticky="nsew")

        info_label = ttk.Label(content_frame, textvariable=self._info_var, justify=tk.LEFT)
        info_label.grid(row=1, column=0, sticky="ew", pady=(10, 0))

        controls = ttk.Frame(content_frame)
        controls.grid(row=2, column=0, sticky="ew", pady=(10, 0))
        controls.columnconfigure(0, weight=1)

        prev_btn = ttk.Button(controls, text="Previous", command=self.show_previous)
        prev_btn.pack(side=tk.LEFT)

        next_btn = ttk.Button(controls, text="Next", command=self.show_next)
        next_btn.pack(side=tk.LEFT, padx=5)

    # ------------------------------------------------------------------
    # Event handlers
    # ------------------------------------------------------------------
    def _on_select(self, _event: Optional[tk.Event] = None) -> None:
        selection = self._listbox.curselection()
        if not selection:
            return

        index = selection[0]
        label_path = self._label_paths[index]

        try:
            image, metadata = self._get_cached_image(label_path)
        except Exception as exc:  # pragma: no cover - GUI feedback path
            messagebox.showerror("Unable to load image", str(exc), parent=self)
            return

        self._display_image(image, metadata)

    def show_next(self) -> None:
        if not self._label_paths:
            return
        selection = self._listbox.curselection()
        index = selection[0] if selection else -1
        index = (index + 1) % len(self._label_paths)
        self._select_index(index)

    def show_previous(self) -> None:
        if not self._label_paths:
            return
        selection = self._listbox.curselection()
        index = selection[0] if selection else 0
        index = (index - 1) % len(self._label_paths)
        self._select_index(index)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _select_index(self, index: int) -> None:
        self._listbox.selection_clear(0, tk.END)
        self._listbox.selection_set(index)
        self._listbox.see(index)
        self._on_select()

    def _get_cached_image(self, label_path: Path) -> Tuple[Image.Image, str]:
        if label_path not in self._image_cache:
            image, metadata = load_image_from_label(label_path)
            self._image_cache[label_path] = image
            self._metadata_cache[label_path] = metadata
        return self._image_cache[label_path], self._metadata_cache[label_path]

    def _display_image(self, image: Image.Image, metadata: str) -> None:
        display_image = image
        max_size = (1024, 1024)
        if display_image.width > max_size[0] or display_image.height > max_size[1]:
            resample = getattr(Image, "Resampling", Image).LANCZOS
            display_image = image.copy()
            display_image.thumbnail(max_size, resample)
            size_info = (
                f"\nDisplayed at {display_image.width} x {display_image.height} pixels (scaled)."
            )
        else:
            size_info = f"\nDisplayed at {display_image.width} x {display_image.height} pixels."

        self._photo_image = ImageTk.PhotoImage(display_image)
        self._image_label.configure(image=self._photo_image)
        self._image_label.image = self._photo_image
        self._info_var.set(metadata + size_info)


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Visualise PDS4 images in a GUI viewer.")
    parser.add_argument(
        "directory",
        nargs="?",
        default=Path.cwd(),
        type=Path,
        help="Directory to scan for PDS4 label files (default: current directory).",
    )
    parser.add_argument(
        "--pattern",
        default="*.xml",
        help="Glob pattern used to locate label files (default: *.xml).",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Iterable[str]] = None) -> None:
    args = parse_args(argv)
    directory = args.directory.expanduser().resolve()
    if not directory.is_dir():
        raise SystemExit(f"{directory} is not a directory.")

    label_paths = discover_label_files(directory, args.pattern)
    if not label_paths:
        raise SystemExit(
            f"No PDS4 label files matching pattern '{args.pattern}' were found in {directory}."
        )

    viewer = PDS4ImageViewer(label_paths)
    viewer.mainloop()


if __name__ == "__main__":
    main()
