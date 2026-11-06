"""Fail before ASR when ffmpeg cannot decode a complete nonempty PCM stream."""
import subprocess

def decode_audio(path):
    result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 's16le', '-ac', '1', '-ar', '16000', '-'], capture_output=True, check=True)
    pcm = result.stdout
    if not pcm or len(pcm) % 2:
        raise ValueError('ffmpeg produced empty or incomplete 16-bit PCM')
    return pcm
