#!/bin/bash
#
# GigClaw Demo Recording Script
# Records terminal demo for 2-3 minutes
#
# Usage: ./record-demo.sh [output_filename]

set -e

OUTPUT_FILE="${1:-gigclaw-demo-$(date +%Y%m%d-%H%M%S).mp4}"
DURATION="${2:-180}"  # 3 minutes default

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  GigClaw Demo Recording Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Output file: $OUTPUT_FILE"
echo "Duration: $DURATION seconds (3 minutes)"
echo ""

# Check if we're in a graphical environment
if [ -z "$WAYLAND_DISPLAY" ] && [ -z "$DISPLAY" ]; then
    echo -e "${RED}Error: No display detected${NC}"
    echo "Make sure you're running this in a graphical session"
    exit 1
fi

# Check available recording tools
if command -v gpu-screen-recorder &> /dev/null; then
    RECORDER="gpu-screen-recorder"
elif command -v wf-recorder &> /dev/null; then
    RECORDER="wf-recorder"
elif command -v ffmpeg &> /dev/null; then
    RECORDER="ffmpeg"
else
    echo -e "${RED}Error: No screen recorder found${NC}"
    echo "Please install gpu-screen-recorder, wf-recorder, or ffmpeg"
    exit 1
fi

echo -e "${GREEN}Using recorder: $RECORDER${NC}"
echo ""

# Countdown function
countdown() {
    echo -e "${YELLOW}Starting recording in...${NC}"
    for i in 5 4 3 2 1; do
        echo -e "${YELLOW}$i...${NC}"
        sleep 1
    done
    echo -e "${GREEN}Recording started!${NC}"
    echo "Press Ctrl+C to stop early"
    echo ""
}

# Recording function
start_recording() {
    case $RECORDER in
        gpu-screen-recorder)
            # gpu-screen-recorder usage
            gpu-screen-recorder -w $(hyprctl activewindow | grep "Window" | head -1 | awk '{print $2}') -f "$OUTPUT_FILE" -q ultra &
            RECORDER_PID=$!
            ;;
        wf-recorder)
            # wf-recorder for Wayland
            wf-recorder -f "$OUTPUT_FILE" -c h264_vaapi &
            RECORDER_PID=$!
            ;;
        ffmpeg)
            # Fallback to ffmpeg with x11grab
            if [ -n "$DISPLAY" ]; then
                ffmpeg -f x11grab -i "$DISPLAY" -codec:v libx264 -preset fast -crf 23 "$OUTPUT_FILE" &
            else
                echo -e "${RED}Error: ffmpeg requires X11 for screen recording${NC}"
                echo "Please install wf-recorder or gpu-screen-recorder for Wayland"
                exit 1
            fi
            RECORDER_PID=$!
            ;;
    esac
}

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}Stopping recording...${NC}"
    if [ -n "$RECORDER_PID" ]; then
        kill $RECORDER_PID 2>/dev/null || true
        wait $RECORDER_PID 2>/dev/null || true
    fi
    
    if [ -f "$OUTPUT_FILE" ]; then
        echo -e "${GREEN}✓ Recording saved to: $OUTPUT_FILE${NC}"
        ls -lh "$OUTPUT_FILE"
    else
        echo -e "${RED}✗ Recording failed${NC}"
    fi
    exit 0
}

# Set trap for cleanup
trap cleanup INT TERM

# Check disk space
AVAILABLE=$(df . | tail -1 | awk '{print $4}')
if [ $AVAILABLE -lt 1048576 ]; then  # Less than 1GB
    echo -e "${YELLOW}Warning: Low disk space (${AVAILABLE}KB available)${NC}"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Main recording flow
countdown
start_recording

# Sleep for duration or wait for interrupt
echo "Recording for $DURATION seconds..."
sleep $DURATION

cleanup
