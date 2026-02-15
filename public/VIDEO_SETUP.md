# Cinematic Background Video Setup

## Required Files

Place your video files in this `public/` directory:

### 1. **background-video.mp4** (Required)
- **Format**: MP4 (H.264 codec)
- **Recommended size**: Under 5MB for optimal performance
- **Resolution**: 1920x1080 or higher
- **Frame rate**: 24-30 fps
- **Compression**: High compression, quality 70-80%
- **Duration**: 10-30 seconds (will loop seamlessly)

**Content Guidelines**:
- Dark, cinematic footage
- Minimal motion (subtle camera movements)
- Low contrast, controlled lighting
- No bright colors or flashy elements
- Professional, private, exclusive feel

**Example content ideas**:
- Slow architectural pans
- Abstract dark textures in motion
- Subtle light reflections
- Minimal geometric patterns
- Professional studio space

### 2. **video-poster.jpg** (Optional but recommended)
- **Format**: JPG or PNG
- **Size**: Under 200KB
- **Resolution**: 1920x1080
- **Purpose**: Shows while video loads

This should be a representative frame from your video.

## Video Optimization Tips

### Using FFmpeg (recommended):
```bash
ffmpeg -i input.mp4 -vcodec h264 -crf 28 -preset slow -vf scale=1920:1080 -an background-video.mp4
```

### Settings explained:
- `-vcodec h264`: Use H.264 codec (best browser support)
- `-crf 28`: Quality level (18-28, higher = smaller file)
- `-preset slow`: Better compression
- `-vf scale=1920:1080`: Set resolution
- `-an`: Remove audio (not needed for muted autoplay)

## Reference

The video is configured with these attributes:
- `autoPlay`: Starts automatically
- `muted`: Required for autoplay in browsers
- `loop`: Plays continuously
- `playsInline`: Prevents fullscreen on mobile
- `preload="auto"`: Loads video on page load

## Fallback

If video files are not found, the page will show a solid black background (#000000).
