# Offer a no-video download package and show each package's size

The Downloads sheet adds a no-video package (text, audio, images and maps) between Text and audio and the full package, labels Text only as the small default, and shows each package's total computed from the passage manifest at the sizes it would request. The service worker saves no video files for the no-video package; offline, an unsaved video shows a plain note instead of a player. Existing Text only, Text and audio and full packages, media delivery and recording policy are unchanged.
