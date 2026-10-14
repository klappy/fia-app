# Bounded-reader decode fixture

A synthetic blue 128×72, one-second VP9-in-MP4 video with no audio. Generated locally with FFmpeg; no source content or paid generation. VP9 makes the fixture decodable in this host's Chromium, which rejected both the bundled H264/HE-AAC original and a synthetic H264-only fixture. This tests MP4 body transfer and browser decoding; it does not qualify production H264/AAC playback or physical iPhone behavior.

Command: `ffmpeg -f lavfi -i color=c=blue:s=128x72:r=10 -t 1 -c:v libvpx-vp9 -pix_fmt yuv420p -an -movflags +faststart video-playback.mp4`
