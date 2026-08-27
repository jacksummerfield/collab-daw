import { useEffect, useState, useRef } from 'react';

function App() {
  // Room state control
  const [roomInput, setRoomInput] = useState('');
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);

  // DAW session state
  const [status, setStatus] = useState('Disconnected');
  const [messages, setMessages] = useState<string[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // this effect runs when the user joins a room
  useEffect(() => {
    if (!currentRoom) return;

    audioCtxRef.current = new window.AudioContext();

    // fetch any tracks that were previously saved in PostgreSQL for this room
    const fetchExistingTracks = async () => {
      try {
        const response = await fetch(`http://localhost:8000/tracks/${currentRoom}`);
        const tracks = await response.json();

        for (const track of tracks) {
          setMessages((prev) => [...prev, `Loaded existing stem: ${track.filename}`]);

          // automatically download and queue existing tracks into the audio engine
          if (audioCtxRef.current) {
            const audioRes = await fetch(track.url);
            const arrayBuffer = await audioRes.arrayBuffer();
            const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
            
            const source = audioCtxRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioCtxRef.current.destination);
            source.start(0);
          }
        }
      } catch (err) {
        console.error("Failed to load room state:", err);
      }
    };

    fetchExistingTracks();

    // connect the WebSocket for real-time traffic
    const ws = new WebSocket(`http://localhost:8000/ws/${currentRoom}`.replace('http', 'ws'));
    
    ws.onopen = () => setStatus('Connected!');
    ws.onclose = () => setStatus('Disconnected');
    
    ws.onmessage = async (event) => {
      const rawMessage = event.data;

      if (rawMessage.startsWith("Broadcast: ")) {
        try {
          const jsonString = rawMessage.replace("Broadcast: ", "");
          const payload = JSON.parse(jsonString);

          if (payload.event === "stem_dropped") {
            // Add a clean, readable message to the feed instead of raw JSON
            setMessages((prev) => [...prev, `Stem uploaded: ${payload.filename}`]);

            // Download and play the audio
            if (audioCtxRef.current) {
              const response = await fetch(payload.url);
              const arrayBuffer = await response.arrayBuffer();
              const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
              
              const source = audioCtxRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioCtxRef.current.destination);
              source.start(0);
            }
          }
        } catch (e) {
          // Fallback if it's not JSON
          setMessages((prev) => [...prev, rawMessage]);
        }
      }
    };
    
    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [currentRoom]);

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomInput.trim()) return;
    setCurrentRoom(roomInput.trim());
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`http://localhost:8000/upload/${currentRoom}`, {
        method: "POST",
        body: formData,
      });
      
      const data = await response.json();
      
      if (data.url && wsRef.current) {
        const payload = JSON.stringify({
          event: "stem_dropped",
          filename: data.filename,
          url: data.url
        });
        
        wsRef.current.send(payload);
      }
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  // View 1: The Landing Page / Room Selection Lobby
  if (!currentRoom) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', background: '#121212', color: '#fff' }}>
        <div style={{ padding: '3rem', background: '#1e1e1e', borderRadius: '8px', width: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          <h1 style={{ marginBottom: '0.5rem' }}>Collab DAW</h1>
          <p style={{ color: '#888', marginBottom: '2rem' }}>Enter a studio room to start jamming in real-time.</p>
          
          <form onSubmit={handleJoinRoom} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input 
              type="text" 
              placeholder="e.g. techno-room-01" 
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #444', background: '#2a2a2a', color: '#fff', fontSize: '1rem' }}
            />
            <button 
              type="submit"
              style={{ padding: '0.75rem', borderRadius: '4px', border: 'none', background: '#3b82f6', color: '#fff', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Enter Studio
            </button>
          </form>
        </div>
      </div>
    );
  }

  // View 2: The Active DAW Workspace
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc', paddingBottom: '1rem' }}>
        <h1>Studio Room: <span style={{ color: '#3b82f6' }}>{currentRoom}</span></h1>
        <button 
          onClick={() => setCurrentRoom(null)} 
          style={{ padding: '0.5rem 1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Leave Room
        </button>
      </div>

      <p style={{ marginTop: '1rem' }}>Server Status: <strong>{status}</strong></p>
      
      <div style={{ marginTop: '2rem', padding: '2rem', border: '2px dashed #444', borderRadius: '8px', textAlign: 'center' }}>
        <h3>Drop a Audio Stem (.wav / .mp3)</h3>
        <input type="file" accept="audio/*" onChange={handleFileUpload} style={{ marginTop: '1rem' }} />
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f3f4f6', borderRadius: '8px' }}>
        <h3>Live Activity Feed ({currentRoom})</h3>
        <ul style={{ maxHeight: '150px', overflowY: 'auto', paddingLeft: '1.2rem', marginTop: '0.5rem' }}>
          {messages.map((msg, index) => (
            <li key={index} style={{ fontSize: '0.9rem', marginBottom: '0.25rem', fontFamily: 'monospace' }}>{msg}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;