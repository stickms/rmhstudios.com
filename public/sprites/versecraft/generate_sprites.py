#!/usr/bin/env python3
"""
Generate Versecraft character sprites from Sutemo PSD files.
Composites layers: hair behind + body + blush(opt) + costume + hair front + expression + accessories(opt)
Uses topil() to extract pixel data from hidden PSD layers, with '>>' path separator.

Characters:
  Luna    - Dark hair, Hime Cut, Seifuku 2, Choker       (Full body Female PSD)
  Sable   - Brown hair, Short hair, Hoodie               (Full body Female PSD)
  Wren    - Silver hair, Twin tail, Summer Dress          (Full body Female PSD)
  Kai     - Pink hair, Short Bob, PE uniform              (Full body Female PSD)
  Rowan   - Blonde hair, Style 4, T-shirt, Blush         (Halfbody Female PSD)
  Milo    - Brown hair, Short 1, Vest, Circle glasses     (Male PSD)
  Teacher - Silver hair, Short Curly, Office Lady         (Mature PSD)
"""

from psd_tools import PSDImage
from PIL import Image
import os

BASE = os.path.dirname(os.path.abspath(__file__))
FULL_PSD = os.path.join(BASE, "extracted/sutemo_female/Female Sprite by Sutemo.psd")
HALF_PSD = os.path.join(BASE, "Halfbody Female by Sutemo.psd")
MATURE_PSD = os.path.join(BASE, "Anime Mature Woman Free.psd")
MALE_PSD = os.path.join(BASE, "extracted/sutemo_male/Male Sprite by Sutemo.psd")


def find_layer(psd_or_group, path):
    """Find a layer by '>>'-separated path. e.g. 'Expression>>Smile'
    Uses '>>' separator to avoid conflicts with '/' in PSD layer names."""
    parts = path.split('>>')
    current = psd_or_group
    for part in parts:
        found = None
        for layer in current:
            if layer.name.strip().lower() == part.strip().lower():
                found = layer
                break
        if found is None:
            # Try partial match
            for layer in current:
                if part.strip().lower() in layer.name.strip().lower():
                    found = layer
                    break
        if found is None:
            print(f"  WARNING: Could not find '{part}' in '{path}'")
            return None
        current = found
    return current


def composite_layers(psd, layer_paths, canvas_size):
    """Composite multiple layers onto a transparent canvas.
    Uses topil() for hidden layers and alpha_composite() for proper PSD blending."""
    result = Image.new('RGBA', canvas_size, (0, 0, 0, 0))
    for path in layer_paths:
        layer = find_layer(psd, path)
        if layer is None:
            continue
        try:
            layer_img = layer.topil()
            if layer_img is None:
                continue
            layer_img = layer_img.convert('RGBA')
            # Place on a full-canvas temp layer, then alpha_composite over result
            temp = Image.new('RGBA', canvas_size, (0, 0, 0, 0))
            temp.paste(layer_img, (layer.left, layer.top))
            result = Image.alpha_composite(result, temp)
        except Exception as e:
            print(f"  Error compositing '{path}': {e}")
    return result


def generate_character(psd, canvas_size, char_name, base_layers, expression_map, out_dir):
    """Generate all expression variants for a character."""
    os.makedirs(out_dir, exist_ok=True)
    for expr_name, expr_path in expression_map.items():
        layers = base_layers + [expr_path]
        img = composite_layers(psd, layers, canvas_size)
        out_path = os.path.join(out_dir, f"{expr_name}.png")
        # Crop to content with some padding
        bbox = img.getbbox()
        if bbox:
            # Add padding
            pad = 20
            left = max(0, bbox[0] - pad)
            top = max(0, bbox[1] - pad)
            right = min(canvas_size[0], bbox[2] + pad)
            bottom = min(canvas_size[1], bbox[3] + pad)
            img = img.crop((left, top, right, bottom))
        img.save(out_path, 'PNG')
        print(f"  {char_name}/{expr_name}.png ({img.width}x{img.height})")


def main():
    print("Loading Full Body PSD...")
    full = PSDImage.open(FULL_PSD)
    full_size = (full.width, full.height)

    print("Loading Halfbody PSD...")
    half = PSDImage.open(HALF_PSD)
    half_size = (half.width, half.height)

    print("Loading Mature PSD...")
    mature = PSDImage.open(MATURE_PSD)
    mature_size = (mature.width, mature.height)

    # ─── Full Body Characters ─────────────────────────────────────────────

    # Expression maps for full body PSD (using >> separator)
    full_expressions = {
        'normal':    'Expression>>normal',
        'smile':     'Expression>>Smile',
        'happy':     'Expression>>Delighted',
        'sad':       'Expression>>Sad',
        'angry':     'Expression>>Angry',
        'smirk':     'Expression>>Smug',
        'annoyed':   'Expression>>Annoyed',
        'shocked':   'Expression>>Shocked',
        'sleepy':    'Expression>>Sleepy',
        'smile2':    'Expression>>Smile 2',
        'laugh':     'Expression>>Laugh',
    }

    # Luna - Dark hair, Long/Hime Cut, Seifuku 2
    print("\nGenerating Luna (dark, hime cut, seifuku 2)...")
    generate_character(full, full_size, 'luna', [
        'Hair behind>>Long Hair / Hime Cut>>Dark',
        'Base Body',
        'Blush>>1',
        'Costume>>seifuku 2',
        'Hair front>>Hime Cut>>Dark',
        'Accessories>>Choker',
    ], full_expressions, os.path.join(BASE, 'luna'))

    # Sable - Brown hair, Short Hair, Hoodie
    print("\nGenerating Sable (brown, short, hoodie)...")
    generate_character(full, full_size, 'sable', [
        'Hair behind>>Short Hair>>Brown',
        'Base Body',
        'Costume>>Hoodie 1',
        'Hair front>>Twin tail / Short Hair>>Brown',
    ], full_expressions, os.path.join(BASE, 'sable'))

    # Wren - Silver hair, Twin Tail, Summer Dress
    print("\nGenerating Wren (silver, twin tail, summer dress)...")
    generate_character(full, full_size, 'wren', [
        'Hair behind>>Twin Tail>>Silver',
        'Base Body',
        'Blush>>1',
        'Costume>>Summer Dress',
        'Hair front>>Twin tail / Short Hair>>Silver',
    ], full_expressions, os.path.join(BASE, 'wren'))

    # Kai - Pink hair, Short Bob, PE uniform
    print("\nGenerating Kai (pink, short bob, PE uniform)...")
    generate_character(full, full_size, 'kai', [
        'Hair behind>>Short Bob>>Pink',
        'Base Body',
        'Costume>>PE uniform',
        'Hair front>>Short Bob>>Pink',
    ], full_expressions, os.path.join(BASE, 'kai'))

    # ─── Halfbody Characters ──────────────────────────────────────────────

    half_expressions = {
        'normal':     'Expresssions>>Normal',
        'smile':      'Expresssions>>Smile 1',
        'smile2':     'Expresssions>>Smile 2',
        'smile3':     'Expresssions>>Smile 3',
        'happy':      'Expresssions>>Happy 1 ',
        'happy2':     'Expresssions>>Happy 2',
        'awkward':    'Expresssions>>Awkward',
        'smirk':      'Expresssions>>Smug',
        'sad':        'Expresssions>>Sad',
        'sad2':       'Expresssions>>Sad 2',
        'annoyed':    'Expresssions>>Annoyed',
        'annoyed2':   'Expresssions>>Annoyed 2',
        'surprised':  'Expresssions>>Surprised',
        'surprised2': 'Expresssions>>Surprise 2',
        'angry':      'Expresssions>>Angry',
        'scared':     'Expresssions>>Scared',
    }

    # Milo - Brown hair, Style 1, Jacket, glasses
    print("\nGenerating Milo (brown, style 1, jacket, glasses)...")
    generate_character(half, half_size, 'milo', [
        'Hair Behind>>Style 4>>Brown',
        'Base Body',
        'Costume>>Jacket',
        'Hair Front>>Style 1>>Brown',
        'Accessories>>glasses',
    ], half_expressions, os.path.join(BASE, 'milo'))

    # Rowan - Blonde hair, Style 4 back / Style 1 front, Seifuku
    print("\nGenerating Rowan (blonde, style 4, T-shirt)...")
    generate_character(half, half_size, 'rowan', [
        'Hair Behind>>Style 4>>Blonde',
        'Base Body',
        'Blush>>Blush1',
        'Costume>>T-shirt 1',
        'Hair Front>>Style 4>>Blonde',
    ], half_expressions, os.path.join(BASE, 'rowan'))

    # ─── Mature Character (Teacher) ───────────────────────────────────────

    mature_expressions = {
        'normal':    'Expression New>>Normal',
        'smile':     'Expression New>>Smile',
        'smile2':    'Expression New>>Smile 2',
        'happy':     'Expression New>>Delighted',
        'happy2':    'Expression New>>Delighted 2',
        'sad':       'Expression New>>sad',
        'crying':    'Expression New>>Crying',
        'angry':     'Expression New>>Angry 1',
        'angry2':    'Expression New>>Angry 2',
        'smirk':     'Expression New>>smug',
        'smirk2':    'Expression New>>Smug 2',
        'annoyed':   'Expression New>>Annoyed',
        'shocked':   'Expression New>>shocked',
        'oh':        'Expression New>>:o',
        'sleepy':    'Expression New>>Sleepy',
        'sleepy2':   'Expression New>>Sleepy 2',
    }

    # Teacher - Silver hair, Short Curly, Office outfit
    print("\nGenerating Teacher (silver, short curly, office)...")
    generate_character(mature, mature_size, 'teacher', [
        'Hair behind>>Short Curly>>Silver',
        'Base',
        'Costume>>Office Worker>>Office Lady',
        'Costume>>Office Worker>>Nametag Copy',
        'Hair front>>Middle Part>>Silver',
        'Nose>>Layer 19',
        'Nose>>Layer 17',
    ], mature_expressions, os.path.join(BASE, 'teacher'))

    # ─── Male Character (Milo) ──────────────────────────────────────────────

    print("\nLoading Male PSD...")
    male = PSDImage.open(MALE_PSD)
    male_size = (male.width, male.height)

    male_expressions = {
        'normal':    'Expression>>Normal',
        'smile':     'Expression>>Smile 1',
        'smile2':    'Expression>>Smile 2',
        'smile3':    'Expression>>Smile 3',
        'laugh':     'Expression>>Laugh',
        'surprised': 'Expression>>Surprised',
        'smirk':     'Expression>>Smirk',
        'angry':     'Expression>>Angry 1',
        'angry2':    'Expression>>Angry 2',
        'sad':       'Expression>>Sad',
        'sweat':     'Expression>>sweat',
    }

    # Milo - Brown hair, Short 1, Vest, circle glasses
    print("\nGenerating Milo (male, brown, short 1, vest, glasses)...")
    generate_character(male, male_size, 'milo', [
        'Hair behind>>Short 1>>Brown',
        'Base Male Body',
        'Outfit>>Vest',
        'HairFront>>Short 1>>Brown',
        'Glasses>>Circle Glasses Copy',
    ], male_expressions, os.path.join(BASE, 'milo'))

    print("\nDone! All sprites generated.")


if __name__ == '__main__':
    main()
