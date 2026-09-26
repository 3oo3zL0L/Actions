import random, re
R = random.Random(3)
W, H = 1600, 1000
def f(v): return ("%.1f" % v).rstrip("0").rstrip(".")
def pine(x, base, h, w):
    # gelaagde spar: van top naar beneden steeds bredere, gekartelde tiers
    tiers = max(5, int(h / 38))
    pts_l, pts_r = [], []
    top = base - h
    for i in range(tiers):
        t = (i + 1) / tiers
        y = top + h * 0.92 * t
        half = w * (0.12 + 0.88 * t) / 2 * R.uniform(0.85, 1.12)
        inner = half * R.uniform(0.45, 0.62)
        yin = y - h / tiers * R.uniform(0.25, 0.4)
        pts_l += [(x - inner, yin), (x - half, y)]
        pts_r += [(x + inner, yin), (x + half, y)]
    trunk = max(2, w * 0.05)
    d = "M%s %s" % (f(x), f(top))
    for (a, b) in pts_r: d += "L%s %s" % (f(a), f(b))
    d += "L%s %sL%s %sL%s %sL%s %s" % (f(x + trunk), f(base - h * 0.08), f(x + trunk), f(base), f(x - trunk), f(base), f(x - trunk), f(base - h * 0.08))
    for (a, b) in reversed(pts_l): d += "L%s %s" % (f(a), f(b))
    return d + "Z"
def layer(n, base, hmin, hmax, wr, jitter):
    d = ""
    xs = sorted(R.uniform(-60, W + 60) for _ in range(n))
    for x in xs:
        h = R.uniform(hmin, hmax)
        d += pine(x, base + R.uniform(-jitter, jitter), h, h * wr * R.uniform(0.8, 1.2))
    return d
stars = []
for i in range(240):
    x, y = R.uniform(0, W), R.uniform(0, 640) ** 1.0
    y = 640 * (R.random() ** 1.6)
    r = R.choice([0.5, 0.6, 0.7, 0.8, 0.9, 1.1, 1.4]) if R.random() < 0.95 else 1.8
    c = R.choice(["#ffffff", "#dfe6ff", "#fff3d6"])
    o = R.uniform(0.25, 0.9)
    stars.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (f(x), f(y), f(r), c, f(o)))
far = layer(70, 770, 90, 200, 0.42, 14)
mid = layer(42, 840, 190, 360, 0.40, 18)
near = layer(22, 930, 330, 560, 0.38, 20)
fore = pine(40, 1010, 900, 330) + pine(1570, 1010, 860, 300) + pine(250, 1015, 640, 230) + pine(1390, 1015, 700, 240)
# jager met geweer, in silhouet tegen de mist, op weg naar het licht
hunter = ("M0 0c3 0 5 2 5 5s-2 5-5 5-5-2-5-5 2-5 5-5z"          # hoofd
          "M-6 11h12l3 22-2 1 2 24h-5l-3-20-2 20h-5l1-24-3-1z"    # romp en benen
          "M5 14l26-9 1 2-24 11z")                                 # geweer
svg = ('<svg viewBox="0 0 %d %d" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" focusable="false">' % (W, H)) + (
 '<defs>'
 '<radialGradient id="fsky" cx=".5" cy=".18" r=".75"><stop offset="0" stop-color="#0b1020"/><stop offset=".55" stop-color="#04060b"/><stop offset="1" stop-color="#000"/></radialGradient>'
 '<linearGradient id="fmist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8c96b4" stop-opacity="0"/><stop offset=".55" stop-color="#8c96b4" stop-opacity=".07"/><stop offset="1" stop-color="#8c96b4" stop-opacity="0"/></linearGradient>'
 '<radialGradient id="fglow"><stop offset="0" stop-color="#e8a317" stop-opacity=".55"/><stop offset=".25" stop-color="#e8a317" stop-opacity=".18"/><stop offset="1" stop-color="#e8a317" stop-opacity="0"/></radialGradient>'
 '<linearGradient id="fway" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9aa7d6" stop-opacity="0"/><stop offset=".5" stop-color="#9aa7d6" stop-opacity=".06"/><stop offset="1" stop-color="#9aa7d6" stop-opacity="0"/></linearGradient>'
 '<filter id="fblur" x="-.2" y="-.5" width="1.4" height="2"><feGaussianBlur stdDeviation="40"/></filter>'
 '</defs>'
 '<rect width="%d" height="%d" fill="url(#fsky)"/>' % (W, H) +
 '<path d="M-100 520C300 300 900 120 1700 -40L1700 120C1000 250 400 420 -100 640Z" fill="url(#fway)" filter="url(#fblur)"/>' +
 "".join(stars) +
 '<path d="%s" fill="#0a0d15"/>' % far +
 '<rect x="0" y="640" width="%d" height="240" fill="url(#fmist)"/>' % W +
 '<circle cx="1040" cy="812" r="70" fill="url(#fglow)"/><circle cx="1040" cy="812" r="2.2" fill="#ffd27a"/>' +
 '<path d="%s" fill="#05070b"/>' % mid +
 '' +
 '<rect x="0" y="760" width="%d" height="200" fill="url(#fmist)" opacity=".6"/>' % W +
 '<path d="%s" fill="#020304"/>' % near +
 '<path transform="translate(1000 842) scale(1.05)" d="%s" fill="#000"/>' % hunter +
 '<path d="%s" fill="#000"/>' % fore +
 '</svg>')
open(__import__("sys").argv[1], "w").write(svg)
print(len(svg))
