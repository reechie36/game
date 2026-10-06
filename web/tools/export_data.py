#!/usr/bin/env python3
"""Export vocabulary data and precompute constants for Letter Rise Web."""

import gzip
import json
import os
import shutil
import pandas as pd

WEB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_DIR = os.path.dirname(WEB_DIR)

GLOBAL_ASSETS_DIR = os.path.join(REPO_DIR, "assets")
GLOBAL_DATA_DIR = os.path.join(GLOBAL_ASSETS_DIR, "data")
GLOBAL_FONTS_DIR = os.path.join(GLOBAL_ASSETS_DIR, "fonts")
GLOBAL_SOUNDS_DIR = os.path.join(GLOBAL_ASSETS_DIR, "sounds")

WEB_ASSETS_DIR = os.path.join(WEB_DIR, "assets")
WEB_SOUNDS_DIR = os.path.join(WEB_ASSETS_DIR, "sounds")

os.makedirs(WEB_ASSETS_DIR, exist_ok=True)
os.makedirs(WEB_SOUNDS_DIR, exist_ok=True)

# 1. Export words.json
merged_path = os.path.join(GLOBAL_DATA_DIR, "merged.csv")
if not os.path.exists(merged_path):
    merged_path = os.path.join(REPO_DIR, "merged.csv")
df = pd.read_csv(merged_path, keep_default_na=False)

word_tiers = {}
word_frequencies = {}

for word, count, tier in zip(df["word"], df["count"], df["tier"]):
    w = str(word).strip().lower()
    if 1 <= len(w) <= 7:
        word_tiers[w] = int(tier)
        try:
            c = int(count)
        except (ValueError, TypeError):
            c = 1
        word_frequencies[w] = word_frequencies.get(w, 0) + c

# Ensure 'a' and 'i' are present
word_tiers.update({"a": 1, "i": 1})
word_frequencies.setdefault("a", 1)
word_frequencies.setdefault("i", 1)

words_data = {w: [word_tiers[w], word_frequencies.get(w, 1)] for w in word_tiers}

words_json_path = os.path.join(WEB_ASSETS_DIR, "words.json")
with open(words_json_path, "w", encoding="utf-8") as f:
    json.dump(words_data, f, separators=(',', ':'))

raw_size = os.path.getsize(words_json_path)
with open(words_json_path, "rb") as f_in:
    compressed = gzip.compress(f_in.read())
gzip_size = len(compressed)

print(f"words.json generated with {len(words_data)} words.")
print(f"Raw size: {raw_size:,} bytes ({raw_size/1024:.1f} KB)")
print(f"Gzip size: {gzip_size:,} bytes ({gzip_size/1024:.1f} KB)")

# 2. Letter weights and points calculation
letter_weights_dict = {}
for word, count in word_frequencies.items():
    for ch in word:
        letter_weights_dict[ch] = letter_weights_dict.get(ch, 0) + count

letter_pool = list(letter_weights_dict.keys())
letter_weights = [letter_weights_dict[ch] for ch in letter_pool]

# Cumulative weights for binary search
cumulative_weights = []
current_sum = 0
for w in letter_weights:
    current_sum += w
    cumulative_weights.append(current_sum)

total_weight = current_sum

# Letter points
points_csv_path = os.path.join(GLOBAL_DATA_DIR, "scrabble_letter_points.csv")
if not os.path.exists(points_csv_path):
    points_csv_path = os.path.join(REPO_DIR, "scrabble_letter_points.csv")
points_df = pd.read_csv(points_csv_path)
letter_points = {
    str(row["character"]).strip().upper(): int(row["points"])
    for _, row in points_df.iterrows()
    if len(str(row["character"]).strip()) == 1
}

print("\n--- Precomputed Constants ---")
print(f"LETTER_POOL: {letter_pool}")
print(f"LETTER_WEIGHTS: {letter_weights}")
print(f"CUMULATIVE_WEIGHTS: {cumulative_weights}")
print(f"TOTAL_WEIGHT: {total_weight}")
print(f"LETTER_POINTS: {letter_points}")

# 3. Copy font
font_src = os.path.join(GLOBAL_FONTS_DIR, "FiraMono-Regular.ttf")
if not os.path.exists(font_src):
    font_src = os.path.join(REPO_DIR, "FiraMono-Regular.ttf")
font_dst = os.path.join(WEB_ASSETS_DIR, "FiraMono-Regular.ttf")
if os.path.exists(font_src):
    shutil.copy2(font_src, font_dst)
    print("Copied FiraMono-Regular.ttf to web/assets/")

# 4. Copy sounds
sound_files = [
    "dice_grab.wav",
    "chips_place_1.wav",
    "item_equip.wav",
    "grand_piano_chime_positive.wav",
    "coin_jingle_small.wav",
    "grand_piano_negative_quick.wav",
    "lock_quick.wav",
    "grand_piano_negative_long.wav",
    "grand_piano_defeated.wav",
]

for sf in sound_files:
    src_file = os.path.join(GLOBAL_SOUNDS_DIR, sf)
    dst_file = os.path.join(WEB_SOUNDS_DIR, sf)
    if os.path.exists(src_file):
        shutil.copy2(src_file, dst_file)
        print(f"Copied sound: {sf}")
    else:
        print(f"Warning: sound file {src_file} not found!")

print("\nExport completed successfully.")
