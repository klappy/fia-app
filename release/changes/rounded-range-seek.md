# Rounded excerpt start times

Original-recording excerpts can now start when the browser rounds a requested seek slightly below the section boundary. Startup, resume, and boundary monitoring consistently use the existing 1 ms seek tolerance; invalid clocks and larger seek errors still fail. Section timestamps, absolute alignment time, and strict end handling are unchanged.

The reproduced fractional-start failure is covered at normal and 1.5× playback speed. Independent review and all 418 application tests pass. Browser capture, release CI, and deployment remain separate verification gates; this change does not qualify new audio ranges or repair the video service.
