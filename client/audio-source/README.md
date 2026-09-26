# Music masters

The original five WAV recordings are preserved here, outside Vite's `public/`
directory. Only the AAC/M4A copies under `public/assets/sounds/` are deployed.
There is no separate ambient B recording; its catalog entry uses ambient A.

Re-encode each changed master with FFmpeg (installed separately, not a runtime dependency):

```sh
ffmpeg -i client/audio-source/music_ambient_a.wav -c:a aac -b:a 128k -movflags +faststart client/public/assets/sounds/music_ambient_a.m4a
```

Apply the same command to the combat/tension A/B masters. Keep the sample rate and
channels; do not trim or normalize individual loops. Listen to the loop boundary
after replacing a master. The initial conversion reduces 51,249,602 bytes of WAV
music to 4,733,957 bytes of AAC containers (about 91% less transfer).
