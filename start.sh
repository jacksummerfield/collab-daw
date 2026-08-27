#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "=== 1. Starting Docker Infrastructure (PostgreSQL & MinIO) ==="
# Check if docker-compose.yml is in the root or inside real-time-daw
if [ -f "docker-compose.yml" ]; then
  docker-compose up -d
  echo "Waiting for PostgreSQL to initialize..."
  sleep 3
elif [ -f "real-time-daw/docker-compose.yml" ]; then
  cd real-time-daw
  docker-compose up -d
  echo "Waiting for Postgre SQL to intialise..."
  cd ..     # return to root dir
  sleep 3
else
  echo "Error: Could not find docker-compose.yml"
  exit 1
fi

# Make sure we are back at the root directory (collab-daw)
cd "$(dirname "$0")"

echo "=== 2. Starting FastAPI Backend ==="
# Activate virtual environment and start uvicorn in the background
if [ -f "real-time-daw/venv/bin/activate" ]; then
  source real-time-daw/venv/bin/activate
elif [ -f "venv/bin/activate" ]; then
  source venv/bin/activate
else
  echo "Creating Python Virtual Environment"
  python3 -m venv real-time-daw/venv
  source real-time-daw/venv/bin/activate
fi

# Navigate to where main.py lives (adjust if your backend folder has a specific name)
# Based on your tree, main.py is likely in real-time-daw or root
if [ -f "real-time-daw/main.py" ]; then
  cd real-time-daw
elif [ -f "main.py" ]; then
  true # already here
fi

# Start Uvicorn in the background and capture its Process ID (PID)
uvicorn main:app --reload &
BACKEND_PID=$!
echo "FastAPI running with PID $BACKEND_PID"

# Return to root
cd "$(dirname "$0")"

echo "=== 3. Starting React Frontend (Vite) ==="
if [ -d "real-time-daw/frontend" ]; then
  cd real-time-daw/frontend
elif [ -d "frontend" ]; then
  cd frontend
else
  echo "Error: Frontend directory not found."
  kill $BACKEND_PID
  exit 1
fi

# Start Vite development server
npm run dev &
FRONTEND_PID=$!
echo "Vite frontend running with PID $FRONTEND_PID"

echo "=================================================="
echo "🚀 Collab DAW is fully running!"
trap "echo 'Shutting down'; docker compose down; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

# Keep script running
wait
