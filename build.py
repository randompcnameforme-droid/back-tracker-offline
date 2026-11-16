#!/usr/bin/env python3
"""Build both apps from src/.

  dist/tracker.html  -> published to the Claude artifact (the tracker)
  index.html         -> the offline app served by GitHub Pages from this repo's root
  sw.js              -> cache name bumped automatically so phones pick up the new offline build
"""
import re, hashlib, pathlib
R = pathlib.Path(__file__).resolve().parent
head = (R/'src/head.html').read_text()
app = (R/'src/app.js').read_text()
local = (R/'src/localdb.js').read_text()

ver = re.search(r'var APP_VERSION="([^"]+)"', app).group(1)
script = '<script>\n(function(){\n' + app + '\n})();\n</script>\n'
(R/'dist').mkdir(exist_ok=True)
(R/'dist/tracker.html').write_text(head + script)

oh = re.sub(r'<script src="https://cdn[^"]+"></script>\n', '', head)
oh = oh.replace('<title>Back Programme Tracker</title>', '<title>Back Tracker Offline</title>')
oh = oh.replace('<meta name="claude:viewport-fit-sides" content="cover">',
  '<meta name="theme-color" content="#0E6A6D">\n<link rel="manifest" href="manifest.webmanifest">\n'
  '<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">')
i = oh.index('<div class="bar">')
reset = ('<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);'
         'padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}'
         'img{max-width:100%}[hidden]{display:none!important}</style>')
off = ('<!doctype html><html lang="en-GB"><head><meta charset="utf-8">'
       '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
       + reset + oh[:i] + '</head><body>' + oh[i:]
       + '<script>window.__OFFLINE=true;if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(){})})}</script>\n'
       + '<script>\n' + local + '\n</script>\n' + script + '</body></html>\n')
(R/'index.html').write_text(off)

tag = 'bt-offline-' + ver + '-' + hashlib.sha1(off.encode()).hexdigest()[:8]
sw = (R/'sw.js').read_text()
sw = re.sub(r'var CACHE="[^"]+";', 'var CACHE="%s";' % tag, sw)
(R/'sw.js').write_text(sw)
print('built', ver, 'tracker', len(head + script), 'offline', len(off), 'cache', tag)
