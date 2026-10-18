#!/bin/bash
cd /workspace/agent-battle/app
k=$1; p=$(python3 -c "import json;print(json.load(open('/workspace/agent-battle/art/prompts.json'))['$k'])")
body=$(python3 -c "import json,sys;print(json.dumps({'model':'x-ai/grok-imagine-image-2.0','prompt':'Cute soft 3D vinyl-toy mascot character, '+sys.argv[1]+'. Head and upper body, centered, front-facing, square composition, character fills the middle. Pixar-like toy render, soft studio lighting. No text, no logos, no watermark.'}))" "$p")
out=$(npx convex run spike:image "$body" 2>&1)
url=$(echo "$out" | python3 -c "import json,sys;print(json.load(sys.stdin)['url'])" 2>/dev/null)
if [ -n "$url" ]; then curl -s "$url" -o /workspace/agent-battle/art/$k.src && echo "$k ok"; else echo "$k FAIL $out" | head -c 400; fi
