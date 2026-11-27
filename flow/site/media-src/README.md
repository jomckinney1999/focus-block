# Hero media source

`underwater-shader.html` is the WebGL shader that renders the hero's background (`public/media/underwater-bg.jpg`, MODE 0) and card video (`public/media/underwater-surface.mp4`, MODE 1). Open it in a browser and call `render(width, height, timeSeconds, mode)` to get a JPEG data URL of one frame.

The video is 14 s of frames at 30 fps (t = 20–34 s), cut to a seamless 12 s loop by crossfading the last 2 s into the first:

```bash
ffmpeg -framerate 30 -i f%04d.jpg -filter_complex "[0:v]split[x][y];[x]trim=start=2:end=14,setpts=PTS-STARTPTS[a];[y]trim=start=0:end=2,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=2:offset=10,format=yuv420p[v]" -map "[v]" -c:v libx264 -crf 22 -movflags +faststart underwater-surface.mp4
```
