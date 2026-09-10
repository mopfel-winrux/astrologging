#!/bin/bash
# usage: tools/mcp.sh <tool-name> '<json-arguments>'   |  tools/mcp.sh list
# cookie: $ASTRO_COOKIE, else .ship-cookie, else the first urbauth value in SHIP.md
HERE=$(cd "$(dirname "$0")/.." && pwd)
C="${ASTRO_COOKIE:-$(cat "$HERE/.ship-cookie" 2>/dev/null || grep -o 'urbauth-~[a-z-]*=[0-9a-z.v]*' "$HERE/SHIP.md" 2>/dev/null | head -1)}"
URL="${ASTRO_MCP_URL:-http://localhost:8081/mcp}"
H=(-H "Cookie: $C" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")
if [ "$1" = list ]; then
  curl -s "${H[@]}" $URL -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' ; exit
fi
curl -s "${H[@]}" $URL -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":${2:-{\}}}}"
