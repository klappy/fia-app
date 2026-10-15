# MCP connector discovery and version negotiation

The owner's October 14, 2026 connector attempt at `https://fiaguide.app/mcp` failed with a generic connection error. Two independently confirmed compatibility defects are corrected:

- Initialization now returns the supported MCP version when a client proposes another version, as required by MCP lifecycle negotiation. Malformed initialization and unsupported subsequent protocol headers remain refused.
- Unused OAuth authorization-server, protected-resource and OpenID discovery paths return explicit JSON 404 responses, including path-qualified discovery. Worker-first routing prevents the SPA fallback from impersonating metadata.

Origin restrictions, tool authority, preparation behavior and authentication are unchanged. GET `/mcp` remains a valid 405 for a server without an SSE stream.

References: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle (Version Negotiation); https://developers.openai.com/plugins/build/app-quickstart (unused OAuth discovery must return 404).

Read-only production evidence: ordinary curl observed OAuth authorization-server discovery returning 200 HTML. A subsequent Python diagnostic batch received Cloudflare error 1010 browser-signature denial; further network probes stopped without changing user agent or bypassing the rule. This does not establish that ChatGPT encountered the same edge restriction. End-to-end ChatGPT reconnection remains a post-deployment check.
