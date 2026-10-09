"""Convert a StrategyWiki stage map image into tile-map rows (legend in src/sim/terrain.ts).

    python3 scripts/convert-map.py reference/maps/stage02.png X0 Y0 X1 Y1 CELL [UPSCALE [SMOOTH [PALETTE]]] > rows.txt

Each CELL x CELL block of the cropped image becomes one tile, classified by the
majority colour: black = void, grey = cliff, olive = ground, speckled grey on
olive = rough, teal = water, dark green = crops, blue-grey = concrete.
UPSCALE enlarges the image first (for maps drawn at a smaller scale), and SMOOTH
runs that many majority-filter passes over the land tiles to tidy speckle.
PALETTE 'area3' reads the darker area 3 map ('h' marks hedges); 'area4' reads the
base rooms' deck ('d') and machinery ('m').
Markers (jump zones, enemies, the hatch) are placed separately in stages.ts.
"""
import sys
from collections import Counter
from PIL import Image


def pixel_class(r, g, b):
    if max(r, g, b) < 25:
        return ' '
    if g - r > 50:
        return '~'
    if b - r > 12 and b > 80:
        return '='
    if g > r + 3:
        return 'f'
    if r >= 70 and b < 35 and 3 <= r - g <= 22:
        return '.'
    if r > 80 and b >= 35 and r - b >= 8:
        return ','
    return '#'


def pixel_class_area3(r, g, b):
    """Area 3 is drawn darker and greener: dim olive ground, near-black green patches."""
    if max(r, g, b) < 25:
        return ' '
    if g - r > 35 and b > 35:
        return '~'
    if b - r > 12 and b > 80:
        return '='
    if r >= 90 and g >= 90 and b < 40 and abs(r - g) < 30:
        return 'h'
    if r > 105 and b < 75 and r - b > 40:
        return '.'  # dirt paths between the paddies
    if b >= 40 or (abs(r - g) < 14 and abs(g - b) < 20 and r > 50):
        return '#'
    if r < 48 and g < 64:
        return 'f'
    return '.'


def pixel_class_area4(r, g, b):
    """Area 4's base rooms: the deck, and machinery (pale steel, orange tanks, pink housings) on it."""
    if max(r, g, b) < 30:
        return ' '
    if max(r, g, b) >= 125 and abs(r - g) < 26 and abs(g - b) < 26:
        return 'm'
    if r > 150 and g < 130 and b < 90:
        return 'm'
    if r > 120 and b > 90 and r - g > 25:
        return 'm'
    return 'd'


PALETTES = {'default': pixel_class, 'area3': pixel_class_area3, 'area4': pixel_class_area4}


def main():
    path, x0, y0, x1, y1, cell = sys.argv[1], *map(int, sys.argv[2:7])
    upscale = int(sys.argv[7]) if len(sys.argv) > 7 else 1
    smooth = int(sys.argv[8]) if len(sys.argv) > 8 else 0
    classify = PALETTES[sys.argv[9] if len(sys.argv) > 9 else 'default']
    im = Image.open(path).convert('RGB')
    if upscale > 1:
        im = im.resize((im.width * upscale, im.height * upscale), Image.NEAREST)
        x0, y0, x1, y1 = x0 * upscale, y0 * upscale, x1 * upscale, y1 * upscale
    px = im.load()
    rows = []
    for ty in range((y1 - y0) // cell):
        row = []
        for tx in range((x1 - x0) // cell):
            counts = Counter(
                classify(*px[x0 + tx * cell + dx, y0 + ty * cell + dy]) for dy in range(cell) for dx in range(cell)
            )
            ch, n = counts.most_common(1)[0]
            total = cell * cell
            # Machinery is outlined in dark lines: a solid share of steel marks a block.
            if counts['m'] >= total * 0.4:
                ch = 'm'
            elif ch == 'm':
                ch = 'd'
            # Speckled rough ground: olive with plenty of grey flecks.
            if ch in '.,' and counts[','] >= total * 0.2 and counts['.'] + counts[','] >= total * 0.7:
                ch = ','
            elif ch == ',':
                ch = '.'
            row.append(ch)
        rows.append(row)
    for _ in range(smooth):
        rows = majority(rows)
    print('\n'.join(''.join(r) for r in cleanup(rows)))


def majority(g):
    """One pass of a 3x3 majority filter over land tiles (the void and water keep their shape)."""
    h, w = len(g), len(g[0])
    out = [row[:] for row in g]
    for y in range(h):
        for x in range(w):
            if g[y][x] in ' ~':
                continue
            counts = Counter(
                g[y + dy][x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if 0 <= y + dy < h and 0 <= x + dx < w
            )
            ch, n = counts.most_common(1)[0]
            if ch not in ' ~' and n >= 5:
                out[y][x] = ch
    return out


def cleanup(g):
    """Tidy classification noise: moss on cliff edges, lone bushes, specks of rock."""
    h, w = len(g), len(g[0])

    def around(x, y, ch):
        return sum(
            1
            for dy in (-1, 0, 1)
            for dx in (-1, 0, 1)
            if (dx or dy) and 0 <= y + dy < h and 0 <= x + dx < w and g[y + dy][x + dx] == ch
        )

    out = [row[:] for row in g]
    for y in range(h):
        for x in range(w):
            c = g[y][x]
            if c == 'f' and around(x, y, '#') + around(x, y, ' ') >= 3:
                out[y][x] = '#'  # moss along a cliff edge
            elif c == 'f' and around(x, y, 'f') <= 1:
                out[y][x] = 'b'  # a lone bush
            elif c == '#' and around(x, y, '#') + around(x, y, ' ') <= 2:
                out[y][x] = '.'  # a fleck of rock on open ground
    return out


main()
