import re
import ssl
import urllib.request

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
url = "https://liftmanual.com/barbell-deadlift/"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, context=ctx, timeout=30).read().decode("utf-8", "ignore")
media = re.findall(r"https://[^\"']+\.(?:gif|mp4|webm|webp)", html, flags=re.I)
print("media", media[:30])
ups = sorted(set(re.findall(r"https://liftmanual.com/wp-content/uploads/[^\"']+", html)))
print("uploads:")
for u in ups:
    print(" ", u)
