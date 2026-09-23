"""Validate the example bundle and CodeSystems on HL7's public validator (R4)."""
import json, sys, urllib.request
from collections import Counter

files = sys.argv[1:]
body = json.dumps({"cliContext": {"sv": "4.0.1", "locale": "en"}, "filesToValidate": [
    {"fileName": f.split('/')[-1], "fileContent": open(f).read(), "fileType": "json"} for f in files]}).encode()
req = urllib.request.Request("https://validator.fhir.org/validate", data=body, headers={"Content-Type": "application/json", "Accept": "application/json"})
res = json.load(urllib.request.urlopen(req, timeout=240))
for out in res.get("outcomes", []):
    issues = out.get("issues", [])
    print(out.get("fileInfo", {}).get("fileName"), dict(Counter(i.get("level") for i in issues)))
    kinds = Counter()
    for i in issues:
        if i.get("level") in ("ERROR", "FATAL"):
            print("  ", i.get("level"), i.get("location", "")[:90], "|", i.get("message", "")[:200])
        elif i.get("level") == "WARNING":
            m = i.get("message", "")
            kinds["profile not published" if "Profile reference" in m else "custom code system" if "CodeSystem" in m else m[:90]] += 1
    for k, v in kinds.most_common(8):
        print("   warning x%d: %s" % (v, k))
