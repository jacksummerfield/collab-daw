# Real-Time Collaborative Browser DAW

A full-stack, distributed web-based Digital Audio Workstation (DAW) featuring room-isolated real-time collaboration, cloud audio storage, relational state persistence, and a custom Web Audio API arrangement timeline.

## Architecture & Tech Stack

- **Frontend:** React, Vite, TypeScript, HTML5 Canvas (Custom timeline & playhead renderer)
- **Audio Engine:** Web Audio API (`AudioContext`, buffer scheduling, lookahead timeline offsets)
- **Backend:** FastAPI, Python, WebSockets (Room-isolated connection manager)
- **Database & ORM:** PostgreSQL, SQLAlchemy (Persistent session track metadata)
- **Object Storage:** MinIO (S3-compatible blob storage for heavy `.wav` / `.mp3` audio stems)
- **Infrastructure:** Docker & Docker Compose

---

## Features

1. **Room Isolation:** Users can create or join isolated studio rooms via dynamic WebSocket routing (`/ws/{room_id}`). Actions and streams broadcast locally without cross-room interference.
2. **Cloud Data Plane:** Heavy audio files are uploaded via multipart HTTP forms, securely streamed into a containerized MinIO bucket, and referenced via pre-signed download URLs.
3. **State Persistence:** Track metadata (filenames, URLs, and grid offsets) are saved to PostgreSQL via SQLAlchemy. Late-joining users automatically fetch and sync existing room states.

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Python 3.10+
- Node.js & npm

### Quick Start (All in one script)

The easiest way to run the entire stack (Docker, FastAPI backend, and Vite frontend) from the project root is using the provided start script:

```bash
chmod +x start.sh
./start.sh
```

This will boot your containers, wait for PostgreSQL to initialise, launch the backend server, start the frontend, and cleanly handle shutdown when you press Ctrl + C

### Manual Setup

#### 1. Start Infrastructure Containers

```bash
docker compose up -d
```

#### 2. Run the FastAPI Backend

```bash
cd real-time-daw
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

#### 3. Run the React Frontend

```bash
cd real-time-daw/frontend
npm install
npm run dev
```
