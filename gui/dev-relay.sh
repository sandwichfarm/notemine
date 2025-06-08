#!/bin/bash

# Kill any existing process on port 7777
lsof -ti:7777 | xargs kill -9 2>/dev/null || true

# Start nak serve as an ephemeral relay
echo "Starting nak ephemeral relay on ws://localhost:7777..."
nohup nak serve --port 7777 > nak-relay.log 2>&1 &
echo $! > nak-relay.pid

echo "nak ephemeral relay started with PID: $(cat nak-relay.pid)"
echo "Logs available at: nak-relay.log"