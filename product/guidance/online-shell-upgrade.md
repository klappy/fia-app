# Online shell upgrade

Saved passage downloads must not indefinitely pin online navigation to historical application HTML. On navigation, attempt the network without HTTP cache. Accept only HTTP 200 HTML containing the app mount and module entry. On network/error/non-app response, retain the installed shell and its matching content pin, then build shell fallback. Preserve saved media, metadata, progress and preferences.

An online-shell client must fetch its JavaScript/CSS from the network instead of historical pack core entries; retain this shell identity when PACK_SELECT attaches compatible content. Existing offline clients continue using their coherent saved shell. No clearing caches or automatic media transfers.

Verify successful upgrade, invalid HTML/404/500 fallback, offline content pins, saved state preservation and historical conflicting JS/CSS isolation. This does not claim the separate storage-status delay is fixed.
