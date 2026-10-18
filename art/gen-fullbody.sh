#!/bin/bash
# Full-body square card art in the same style, using the existing head-and-shoulders card as the reference image.
# Usage: gen-fullbody.sh <key>   -> art/fullbody/<key>.src.jpg
cd /workspace/agent-battle/app
k=$1
python3 -c "
import json,base64,sys
p=json.load(open('/workspace/agent-battle/art/full-prompts.json'))['$k']
b=base64.b64encode(open('public/c/$k.v1.webp','rb').read()).decode()
json.dump({'model':'x-ai/grok-imagine-image-2.0','prompt':p,'image':{'url':'data:image/webp;base64,'+b,'type':'image_url'}},open('/tmp/fb-$k.json','w'))"
out=$(npx convex run spike:image "$(cat /tmp/fb-$k.json)" 2>&1)
url=$(echo "$out" | python3 -c "import json,sys;print(json.load(sys.stdin)['url'])" 2>/dev/null)
if [ -n "$url" ]; then curl -s "$url" -o /workspace/agent-battle/art/fullbody/$k.src.jpg && echo "$k ok"; else echo "$k FAIL $(echo $out | head -c 300)"; fi
