#!/bin/bash

# Configuration
LOG_DIR="logs"
LOG_FILE="$LOG_DIR/simulating.log"
PID_FILE="$LOG_DIR/simulating.pid"
COMMAND="npm run dev"
PROCESS_PATTERN="ts-node src/index.ts"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

function get_pid() {
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo "$pid"
            return 0
        fi
    fi
    
    # Fallback to pattern matching if PID file is missing or stale
    pid=$(pgrep -f "$PROCESS_PATTERN" | head -n 1)
    if [ -n "$pid" ]; then
        echo "$pid"
        return 0
    fi
    
    return 1
}

case "$1" in
    start)
        pid=$(get_pid)
        if [ -n "$pid" ]; then
            echo "✅ [Simulating] Already running with PID: $pid"
        else
            echo "🚀 [Simulating] Starting bot in background..."
            echo "📝 Logs: $LOG_FILE"
            
            # Start the command in background
            nohup $COMMAND > "$LOG_FILE" 2>&1 &
            
            # Allow a moment for it to start
            sleep 2
            
            new_pid=$(pgrep -f "$PROCESS_PATTERN" | head -n 1)
            if [ -n "$new_pid" ]; then
                echo "$new_pid" > "$PID_FILE"
                echo "✅ [Simulating] Started successfully with PID: $new_pid"
            else
                echo "❌ [Simulating] Failed to start. Check $LOG_FILE for errors."
            fi
        fi
        ;;
        
    stop)
        pid=$(get_pid)
        if [ -n "$pid" ]; then
            echo "🛑 [Simulating] Stopping bot (PID: $pid)..."
            # Kill the process and its children if any
            pkill -f "$PROCESS_PATTERN"
            rm -f "$PID_FILE"
            echo "✅ [Simulating] Stopped."
        else
            echo "⚠️  [Simulating] Bot is not running."
        fi
        ;;
        
    status)
        pid=$(get_pid)
        if [ -n "$pid" ]; then
            echo "🟢 [Simulating] Bot is RUNNING with PID: $pid"
            echo "🕒 Last 5 lines of logs:"
            tail -n 5 "$LOG_FILE"
        else
            echo "🔴 [Simulating] Bot is STOPPED."
        fi
        ;;
        
    *)
        echo "Usage: $0 {start|status|stop}"
        exit 1
        ;;
esac
