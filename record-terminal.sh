#!/bin/bash
#
# Simple terminal demo recording using ffmpeg
# Optimized for Alacritty on Hyprland/Wayland
#

OUTPUT="${1:-gigclaw-terminal-demo.mp4}"
DURATION=180  # 3 minutes

echo "GigClaw Terminal Demo Recording"
echo "================================"
echo ""
echo "This will record your terminal for the demo video."
echo "Output: $OUTPUT"
echo ""
echo "SETUP INSTRUCTIONS:"
echo "1. Open Alacritty terminal"
echo "2. Maximize the window (fullscreen looks best)"
echo "3. Run: ./demo-commands.sh"
echo "4. Start this recording script in another terminal"
echo ""
read -p "Press Enter when ready to start recording..."

# Try different recording methods
if command -v gpu-screen-recorder &>/dev/null; then
    echo "Using gpu-screen-recorder..."
    
    # Get the active window PID (Alacritty)
    WINDOW_PID=$(hyprctl activewindow | grep "pid:" | awk '{print $2}')
    
    if [ -n "$WINDOW_PID" ]; then
        echo "Recording window PID: $WINDOW_PID"
        timeout $DURATION gpu-screen-recorder -w $WINDOW_PID -f "$OUTPUT" -q ultra || true
    else
        echo "Recording full screen..."
        timeout $DURATION gpu-screen-recorder -f "$OUTPUT" -q ultra || true
    fi
    
elif command -v wf-recorder &>/dev/null; then
    echo "Using wf-recorder..."
    timeout $DURATION wf-recorder -f "$OUTPUT" -c h264 --file-format mp4 || true
    
else
    echo "No Wayland recorder found. Using OBS is recommended."
    echo ""
    echo "Manual OBS Setup:"
    echo "1. Open OBS Studio"
    echo "2. Add 'Window Capture' source"
    echo "3. Select Alacritty window"
    echo "4. Start recording"
    echo "5. Run the demo commands"
    exit 1
fi

if [ -f "$OUTPUT" ]; then
    echo ""
    echo "✓ Recording complete: $OUTPUT"
    ls -lh "$OUTPUT"
    
    # Check file size
    SIZE=$(du -h "$OUTPUT" | cut -f1)
    echo "File size: $SIZE"
    
    # If too large, compress
    if [ $(stat -f%z "$OUTPUT" 2>/dev/null || stat -c%s "$OUTPUT") -gt 52428800 ]; then
        echo ""
        echo "File is large. Compressing..."
        ffmpeg -i "$OUTPUT" -vcodec libx264 -crf 28 -preset faster "${OUTPUT%.mp4}-compressed.mp4"
        echo "✓ Compressed version created"
    fi
else
    echo "✗ Recording failed"
    exit 1
fi
