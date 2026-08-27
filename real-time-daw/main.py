from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from minio import Minio
import io
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# connect to PostgreSQL container built in docker-compose.yml
DATABASE_URL = "postgresql://daw_user:daw_password@localhost:5432/daw_database"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# define the relational table schema
class TrackModel(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, index=True)
    filename = Column(String)
    url = Column(String)
    start_time = Column(Integer, default=0) # Position on the timeline in seconds

# automatically create the tables in PostgreSQL on startup
Base.metadata.create_all(bind=engine)

app = FastAPI()

# init MiniIO client
minio_client = Minio(
    "localhost:9000",
    access_key="minio_admin",
    secret_key="minio_password123",
    secure=False
)

BUCKET_NAME = "daw-stems"

# ensure bucket exists when server starts
try:
    if not minio_client.bucket_exists(BUCKET_NAME):
        minio_client.make_bucket(BUCKET_NAME)
        print(f"Created MinIO bucket: {BUCKET_NAME}")
except Exception as e:
    print(f"MinIO connection error: {e}")

# Allow your local React frontend to communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# keeps track of every connected browser
class ConnectionManager:
    def __init__(self):
        # maps a room string to a list of active websocket connections
        self.active_connections: dict[str, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        
        # if first person in room, create room list
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
            
        self.active_connections[room_id].append(websocket)
        
    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].remove(websocket)
            
            # clean up memory
            # if rooom empty, delete completely
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
        
    async def broadcast(self, message: str, room_id: str):
        # only loop through users in this specific room
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                await connection.send_text(message)
            
manager = ConnectionManager()



@app.get("/")
def health_check():
    return {"status": "FastAPI DAW Server is running!"}

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(websocket, room_id)
    print(f"Client joined '{room_id}'. Users in room: {len(manager.active_connections[room_id])}")
    
    try:
        while True:
            # wait for message from any user
            data = await websocket.receive_text()
            
            # broadcast message to every user
            await manager.broadcast(f"Broadcast: {data}", room_id)
            
    except WebSocketDisconnect:
        # remove user if close tab
        manager.disconnect(websocket, room_id)
        print(f"Client disconnected from '{room_id}'")
        
        
@app.post("/upload/{room_id}")
async def upload_stem(room_id: str, file: UploadFile = File(...), start_time: int = 0):
    try:
        file_data = await file.read()
        file_stream = io.BytesIO(file_data)
        
        # upload to MinIO
        minio_client.put_object(
            BUCKET_NAME,
            file.filename,
            file_stream,
            length=len(file_data),
            content_type=file.content_type
        )
        
        download_url = minio_client.presigned_get_object(BUCKET_NAME, file.filename)
        
        # save metadata to PostgreSQL
        db = SessionLocal()
        new_track = TrackModel(
            room_id=room_id, 
            filename=file.filename, 
            url=download_url,
            start_time=start_time
        )
        db.add(new_track)
        db.commit()
        db.close()
        
        return {"filename": file.filename, "url": download_url, "start_time": start_time}        
    except Exception as e:
        return {"error": str(e)}
    
    
@app.get("/tracks/{room_id}")
async def get_room_tracks(room_id: str):
    db = SessionLocal()
    tracks = db.query(TrackModel).filter(TrackModel.room_id == room_id).all()
    db.close()
    
    # return the list of files and their fresh MinIO URLs
    return [{"filename": t.filename, "url": t.url} for t in tracks]