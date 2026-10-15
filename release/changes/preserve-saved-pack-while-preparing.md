# Preserve saved content during preparation

A live pack response indicating that new content is preparing no longer retires an already verified offline snapshot. The live preparing response still reaches the page unchanged. Explicit unavailable/refused responses, invalid content and failed integrity checks continue to retire unusable snapshots.
