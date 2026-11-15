# 単一HTML（dist/suberi.html）を作る：エンジン・面データ・効果音を埋め込む
import base64, pathlib, re
root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')
eng = (root / 'engine.js').read_text(encoding='utf-8')
game = (root / 'game.js').read_text(encoding='utf-8')
lv = (root / 'levels.txt').read_text(encoding='utf-8')
snd = ''.join(
    f'<script type="text/plain" id="snd-{p.stem}">data:audio/wav;base64,{base64.b64encode(p.read_bytes()).decode()}</script>\n'
    for p in sorted((root / 'sounds').glob('*.wav')))
html = html.replace('<script src="engine.js" id="engine"></script>', f'<script id="engine">\n{eng}</script>')
html = html.replace('<script src="game.js"></script>',
                    f'<script type="text/plain" id="levels">\n{lv}</script>\n{snd}<script>\n{game}</script>')
out = root / 'dist'; out.mkdir(exist_ok=True)
(out / 'suberi.html').write_text(html, encoding='utf-8')
print('ok', len(html))

# Artifact公開用：doctype/html/head/body を外した本文だけの版
art = html
for pat in [r'<!doctype html>\s*', r'<html[^>]*>\s*', r'</html>\s*', r'<head>\s*', r'</head>\s*', r'<body>\s*', r'</body>\s*',
            r'<meta charset="utf-8">\s*', r'<meta name="viewport"[^>]*>\s*']:
    art = re.sub(pat, '', art, flags=re.I)
(out / 'artifact.html').write_text(art, encoding='utf-8')
print('artifact', len(art))

# 公開サイト用：効果音をmp3に圧縮した軽量版（dist/web/index.html）
snd2 = ''.join(
    f'<script type="text/plain" id="snd-{p.stem}">data:audio/mpeg;base64,{base64.b64encode(p.read_bytes()).decode()}</script>\n'
    for p in sorted((root / 'sounds-mp3').glob('*.mp3')))
web = html.replace(snd, snd2)
(out / 'web').mkdir(exist_ok=True)
(out / 'web' / 'index.html').write_text(web, encoding='utf-8')
print('web', len(web))
