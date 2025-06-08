#!/bin/bash

if [ -f nak-relay.pid ]; then
    PID=$(cat nak-relay.pid)
    if kill -0 $PID 2>/dev/null; then
        echo "Stopping nak relay (PID: $PID)..."
        kill $PID
        rm nak-relay.pid
        echo "nak relay stopped."
    else
        echo "nak relay not running (stale PID file)."
        rm nak-relay.pid
    fi
else
    echo "No nak relay PID file found."
    # Try to kill any nak relay process anyway
    pkill -f "nak relay" 2>/dev/null || true
fi