"""Genera dist/artifact.html (página sin <html>/<head>/<body>) para publicar como artefacto de Claude."""
import re, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
s = (raiz / 'index.html').read_text(encoding='utf-8')
s = re.sub(r'<!doctype html>\s*', '', s, flags=re.I)
s = re.sub(r'</?(html|head|body)[^>]*>\s*', '', s, flags=re.I)
s = s.replace('<meta charset="utf-8">\n', '').replace('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n', '')
s = s.replace('<title>SER INTEGRAL 360</title>', '<title>SER INTEGRAL 360</title>\n<meta name="claude:viewport-fit-sides" content="cover">')
# La CSP del sitio no aplica en el visor de artefactos (que define la suya).
s = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\s*', '', s, flags=re.I)
(raiz / 'dist').mkdir(exist_ok=True)
(raiz / 'dist' / 'artifact.html').write_text(s, encoding='utf-8')
print(s[:400])
