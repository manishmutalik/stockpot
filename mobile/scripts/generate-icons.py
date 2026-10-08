"""
generate-icons.py

Makes the app icon, the Android adaptive icon layers, the notification icon, the favicon and the splash image from the pot
mark in assets/logo-full.png (the mark is the part above the STOCKPOT lettering). Run it from the mobile folder after
changing the logo: `python3 scripts/generate-icons.py` (needs Pillow and numpy). The results are committed.

 - icon.png: a white pot on the brand teal, full bleed (iOS rounds the corners itself).
 - android-icon-background.png / -foreground.png / -monochrome.png: the adaptive icon. The mark stays inside the central
   circle (about 61% of the canvas) that every phone's icon shape keeps; the monochrome layer is what Android 13 tints.
 - notification-icon.png: white on transparent, 96 px: Android only shows the shape, so it cannot be the full icon.
 - splash-icon.png: the dark pot on transparent; Android 12+ shows it inside a circle, so the mark is kept small.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

TEAL = (0x00, 0x79, 0x7B)
INK = (0x2B, 0x31, 0x3D)
ASSETS = Path(__file__).resolve().parent.parent / 'assets'


def mark_alpha() -> Image.Image:
    """The pot mark's alpha channel, cropped tight, enlarged smoothly so its edges stay crisp at icon sizes."""
    logo = Image.open(ASSETS / 'logo-full.png').convert('RGBA')
    alpha = np.array(logo.getchannel('A'))
    rows = np.where((alpha > 40).any(axis=1))[0]
    gap = next(i for i in range(1, len(rows)) if rows[i] != rows[i - 1] + 1)  # the gap above the lettering
    top = rows[:gap]
    band = alpha[top.min():top.max() + 1]
    cols = np.where((band > 40).any(axis=0))[0]
    crop = logo.getchannel('A').crop((int(cols.min()), int(top.min()), int(cols.max()) + 1, int(top.max()) + 1))
    big = crop.resize((crop.width * 4, crop.height * 4), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2))
    # Sharpen the soft edge back up: a steep curve around the half-way grey.
    lut = [int(255 / (1 + np.exp(-(v - 128) / 14))) for v in range(256)]
    return big.point(lut)


def place(mark: Image.Image, canvas: int, height_fraction: float, colour, background=None) -> Image.Image:
    """The mark in one colour, `height_fraction` of the canvas tall, centred, on a background (or transparent)."""
    h = round(canvas * height_fraction)
    w = round(mark.width * h / mark.height)
    shape = mark.resize((w, h), Image.LANCZOS)
    out = Image.new('RGBA', (canvas, canvas), background + (255,) if background else (0, 0, 0, 0))
    solid = Image.new('RGBA', (w, h), colour + (255,))
    solid.putalpha(shape)
    out.alpha_composite(solid, ((canvas - w) // 2, (canvas - h) // 2))
    return out


def main() -> None:
    mark = mark_alpha()
    white = (255, 255, 255)
    place(mark, 1024, 0.62, white, TEAL).convert('RGB').save(ASSETS / 'icon.png')
    Image.new('RGBA', (1024, 1024), TEAL + (255,)).save(ASSETS / 'android-icon-background.png')
    place(mark, 1024, 0.46, white).save(ASSETS / 'android-icon-foreground.png')
    place(mark, 1024, 0.46, white).save(ASSETS / 'android-icon-monochrome.png')
    place(mark, 96, 0.84, white).save(ASSETS / 'notification-icon.png')
    place(mark, 1024, 0.50, INK).save(ASSETS / 'splash-icon.png')
    place(mark, 48, 0.70, white, TEAL).convert('RGB').save(ASSETS / 'favicon.png')


if __name__ == '__main__':
    main()
