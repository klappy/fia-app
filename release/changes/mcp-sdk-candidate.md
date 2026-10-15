# Unreleased SDK transport candidate

Replaces FIA's handwritten JSON-RPC dispatch with MCP SDK 1.30.0 tool registration and Cloudflare Agents 0.22.0 createLegacyMcpHandler in the deployed Worker entry. Zod 4.4.3 strict schemas reject extra fields. Existing operations, bounded 16KiB/fatal UTF8 input, origin checks and no-auth discovery remain.

The Node test face uses the official SDK WebStandard transport. The production path uses Agents; separate bundled workerd tests exercise that exact entry. Native Fetch responses preserve SDK SSE streams; request abort closes GET servers. Other requests close their request-local server after the SDK response is produced. No durable MCP session is added.

SDK negotiation preserves supported requested protocol versions. Unexpected operation faults now return a sanitized MCP isError result over HTTP 200, carrying the unchanged internal-error outcome. Unknown methods/tools follow SDK error semantics. These are intentional transport changes, not domain changes.

HOLD: This draft is not a release or proof of ChatGPT connection. Literal McpAgent-class law disposition, fresh independent review, environment gates and an actual ChatGPT connection plus readonly call remain required. Closure hashes here are candidate inputs for that review, not independent review attestation. No binding, auth, source, media, paid operation or production change.
