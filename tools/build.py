"""gas/Index.html から GitHub Pages 用の docs/index.html を作る。
使い方: python3 tools/build.py   (gas/Index.html を編集したら毎回実行)"""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "gas" / "Index.html").read_text(encoding="utf-8")

head = """<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Plate Log</title>
<meta name="theme-color" content="#f3f5f8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#12161d" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Plate Log">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<script src="config.js"></script>"""
out = src.replace('<base target="_top">\n', "", 1)
assert '<meta charset="utf-8">' in out
out = out.replace('<meta charset="utf-8">', head, 1)
sw = """<script>
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
</script>
</body>"""
out = out[::-1].replace("</body>"[::-1], sw[::-1], 1)[::-1]
# safe-area padding at top for standalone mode (Apps Script page had none)
out = out.replace("html,body{background:var(--bg);color:var(--fg)}",
                  "html,body{background:var(--bg);color:var(--fg)}\n:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}", 1)
(root / "docs" / "index.html").write_text(out, encoding="utf-8")
print("docs/index.html を更新しました")
