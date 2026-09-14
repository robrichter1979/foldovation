"""
Regenerate the mapping samples cache from the current sample image.

Usage:
    python scripts/rebuild_samples.py
    python scripts/rebuild_samples.py --image image_data/some_other_image.png
"""
import argparse
import ast
import json
import os
import sys

import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from foldo.config import settings
from foldo.core import combine_to_final_image_new, restore_tuples


def encode_thumbnail(image) -> str:
    import base64
    thumbnail = cv2.resize(image, (150, 150), interpolation=cv2.INTER_LINEAR)
    _, buffer = cv2.imencode(".jpeg", thumbnail)
    return "data:image/jpeg;base64," + base64.b64encode(buffer).decode()


def rebuild(image_path: str):
    print(f"Loading mappings from {settings.mappings_path} ...")
    with open(settings.mappings_path, "r") as f:
        loaded = restore_tuples(json.load(f))
    mappings = {
        name: {ast.literal_eval(k): v for k, v in mapping.items()}
        for name, mapping in loaded.items()
    }

    hidden = cv2.imread(settings.hidden_image_path)
    background = cv2.imread(settings.background_image_path)

    sample = cv2.imread(image_path)
    if sample is None:
        print(f"Error: could not load image '{image_path}'")
        sys.exit(1)
    resized = cv2.resize(sample, (400, 400), interpolation=cv2.INTER_LINEAR)
    image_mapping = {"hidden": hidden, "background": background, "original": resized}

    print(f"Generating thumbnails for {len(mappings)} mappings ...")
    samples = {}
    for i, (name, mapping) in enumerate(mappings.items(), 1):
        result = combine_to_final_image_new(mapping, image_mapping)
        samples[name] = encode_thumbnail(result)
        print(f"  [{i}/{len(mappings)}] {name}", end="\r")

    with open(settings.samples_cache_path, "w") as f:
        json.dump(samples, f)

    print(f"\nDone. Cache written to {settings.samples_cache_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Rebuild mapping sample thumbnails.")
    parser.add_argument(
        "--image",
        default=settings.sample_image_path,
        help=f"Template image to use (default: {settings.sample_image_path})",
    )
    args = parser.parse_args()
    rebuild(args.image)
