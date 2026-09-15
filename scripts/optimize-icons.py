from pathlib import Path
from PIL import Image

root = Path('/home/ubuntu/dgh-fpl-dominator/assets/images')
for name in ['icon.png', 'splash-icon.png', 'favicon.png', 'android-icon-foreground.png']:
    path = root / name
    image = Image.open(path).convert('RGBA')
    target = 1024 if name != 'favicon.png' else 512
    image.thumbnail((target, target), Image.Resampling.LANCZOS)
    image.save(path, format='PNG', optimize=True, compress_level=9)
