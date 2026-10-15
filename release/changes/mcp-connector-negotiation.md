# MCP connector discovery and version negotiation

The owner's October 14, 2026 connector attempt at `https://fiaguide.app/mcp` failed with a generic connection error. Two independently confirmed compatibility defects are corrected:

- Initialization now returns the supported MCP version when a client proposes another version, as required by MCP lifecycle negotiation. Malformed initialization and unsupported subsequent protocol headers remain refused.
- Unused OAuth authorization-server, protected-resource and OpenID discovery paths return explicit JSON 404 responses, including path-qualified discovery. Worker-first routing prevents the SPA fallback from impersonating metadata.

Origin restrictions, tool authority, preparation behavior and authentication are unchanged. GET `/mcp` remains a valid 405 for a server without an SSE stream.

References: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle (Version Negotiation); https://developers.openai.com/plugins/build/app-quickstart (unused OAuth discovery must return 404).

Read-only production evidence: ordinary curl observed OAuth authorization-server discovery returning 200 HTML. A subsequent Python diagnostic batch received Cloudflare error 1010 browser-signature denial; further network probes stopped without changing user agent or bypassing the rule. This does not establish that ChatGPT encountered the same edge restriction. End-to-end ChatGPT reconnection remains a post-deployment check.

Authorized Worker logs additionally show the actual ChatGPT client (`openai-mcp/1.0.0`) reaching the application: `server/discover` with version `2026-07-28` returned 400, followed by another POST 400 and GET 405. This is distinct from the diagnostic Python edge denial. The second POST body was not captured, so its method/version is not asserted. Modern dual-era clients use a non-modern HTTP 400 to detect legacy servers and fall back to initialization; a regression covers that probe followed by a valid legacy negotiation and tool listing. This server continues to advertise only `2025-06-18`, not modern protocol support.

Additional reference: https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning (legacy HTTP fallback).
