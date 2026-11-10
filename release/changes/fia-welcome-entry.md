# FIA welcome entry

Adds a separate `/welcome/` page explaining FIA, with an authentic portrait guide preview and one primary Open FIA action. Existing app root, PWA entry, deep links and QR target remain unchanged. No process video is included.

The new service worker preserves the welcome page as an online destination. Existing installed clients can update from the app root and then reopen the welcome page; automatic recovery of the first old-worker navigation is not promised.
