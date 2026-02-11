import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// PeerJS library is geladen via index.html
declare const Peer: any;

// --- CONFIGURATIE ---
// Pas dit aan als je repository naam anders is
const GITHUB_BASE_URL = "https://v68799.github.io/PongGamecontroller/";

// --- COMPONENT: CONTROLLER ---
const ControllerMode: React.FC<{ hostId: string; player: 1 | 2 }> = ({ hostId, player }) => {
  const [status, setStatus] = useState<'CONNECTING' | 'CONNECTED' | 'ERROR'>('CONNECTING');
  const connRef = useRef<any>(null);
  const peerRef = useRef<any>(null);

  useEffect(() => {
    // We gebruiken een unieke ID voor de controller om conflicten te voorkomen
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id: string) => {
      console.log('Controller online. ID:', id, 'Connecting to TV:', hostId);
      const conn = peer.connect(hostId, { serialization: 'json' });
      connRef.current = conn;
      
      conn.on('open', () => {
        setStatus('CONNECTED');
        // Stuur herhaaldelijk JOIN totdat TV antwoordt
        const joinInterval = setInterval(() => {
          if (conn.open) conn.send({ type: 'JOIN', player });
        }, 1000);
        setTimeout(() => clearInterval(joinInterval), 5000);
      });

      conn.on('error', (err: any) => {
        console.error('Connection error:', err);
        setStatus('ERROR');
      });
      
      conn.on('close', () => setStatus('ERROR'));
    });

    peer.on('error', (err: any) => {
      console.error('Peer error:', err);
      setStatus('ERROR');
    });

    return () => peer.destroy();
  }, [hostId, player]);

  const handleInput = (clientY: number) => {
    if (status !== 'CONNECTED') return;
    const pos = Math.max(0, Math.min(1, clientY / window.innerHeight));
    if (connRef.current?.open) {
      connRef.current.send({ type: 'MOVE', pos, player });
    }
  };

  return (
    <div 
      className={`fixed inset-0 touch-none select-none flex flex-col items-center justify-center transition-colors duration-500 ${player === 1 ? 'bg-emerald-950' : 'bg-blue-950'}`}
      onTouchMove={(e) => handleInput(e.touches[0].clientY)}
      onMouseMove={(e) => e.buttons === 1 && handleInput(e.clientY)}
    >
      <div className="p-10 border-4 border-white/10 rounded-[4rem] text-center">
        <h1 className="text-9xl font-black text-white/10 italic">P{player}</h1>
        <p className="mt-4 font-bold tracking-[0.3em] text-white animate-pulse">
          {status === 'CONNECTED' ? 'VERBONDEN' : 'VERBINDEN...'}
        </p>
      </div>
      <div className="absolute bottom-12 text-white/20 uppercase font-bold text-[10px] tracking-widest text-center px-4">
        {status === 'CONNECTED' ? 'Sleep op je scherm om te bewegen' : `Verbinding maken met kamer: ${hostId}`}
      </div>
    </div>
  );
};

// --- COMPONENT: TV / GAME ENGINE ---
const TVMode: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [roomId, setRoomId] = useState('');
  const [peerStatus, setPeerStatus] = useState('OFFLINE');
  const [joined, setJoined] = useState({ p1: false, p2: false });
  const state = useRef({ 
    p1Y: 0.5, p2Y: 0.5, 
    ballX: 0.5, ballY: 0.5, 
    ballVX: 0.006, ballVY: 0.003, 
    p1Score: 0, p2Score: 0 
  });

  useEffect(() => {
    const id = Math.random().toString(36).substring(2, 6).toUpperCase();
    setRoomId(id);
    const peer = new Peer(id);

    peer.on('open', (id: string) => {
      setPeerStatus('ONLINE');
      console.log('TV ONLINE. Room ID:', id);
    });

    peer.on('connection', (conn: any) => {
      conn.on('data', (data: any) => {
        if (data.type === 'JOIN') {
          if (data.player === 1) setJoined(prev => ({ ...prev, p1: true }));
          if (data.player === 2) setJoined(prev => ({ ...prev, p2: true }));
        }
        if (data.type === 'MOVE') {
          if (data.player === 1) state.current.p1Y = data.pos;
          if (data.player === 2) state.current.p2Y = data.pos;
        }
      });
    });

    let frame: number;
    const loop = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;
      const w = canvas.width = window.innerWidth;
      const h = canvas.height = window.innerHeight;

      ctx.fillStyle = '#050505'; ctx.fillRect(0,0,w,h);
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(w/2-2, 0, 4, h);
      
      // Scores
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.font = '900 200px Inter'; ctx.textAlign='center';
      ctx.fillText(state.current.p1Score.toString(), w*0.25, h*0.6);
      ctx.fillText(state.current.p2Score.toString(), w*0.75, h*0.6);

      // Paddles
      ctx.fillStyle = '#10b981'; ctx.fillRect(10, (state.current.p1Y - 0.1) * h, 20, 0.2 * h);
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(w - 30, (state.current.p2Y - 0.1) * h, 20, 0.2 * h);
      
      if (joined.p1 && joined.p2) {
        state.current.ballX += state.current.ballVX;
        state.current.ballY += state.current.ballVY;

        if (state.current.ballY < 0.05 || state.current.ballY > 0.95) state.current.ballVY *= -1;
        
        const paddleH = 0.2;
        if (state.current.ballX < 0.03 && Math.abs(state.current.ballY - state.current.p1Y) < paddleH/2) {
          state.current.ballVX = Math.abs(state.current.ballVX) * 1.1;
          state.current.ballX = 0.031;
        }
        if (state.current.ballX > 0.97 && Math.abs(state.current.ballY - state.current.p2Y) < paddleH/2) {
          state.current.ballVX = -Math.abs(state.current.ballVX) * 1.1;
          state.current.ballX = 0.969;
        }

        if (state.current.ballX < 0) { state.current.p2Score++; resetBall(); }
        if (state.current.ballX > 1) { state.current.p1Score++; resetBall(); }
      }

      function resetBall() {
        state.current.ballX = 0.5; state.current.ballY = 0.5;
        state.current.ballVX = (Math.random() > 0.5 ? 1 : -1) * 0.006;
      }

      ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(state.current.ballX * w, state.current.ballY * h, 12, 0, Math.PI*2); ctx.fill();

      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => { peer.destroy(); cancelAnimationFrame(frame); };
  }, [joined.p1, joined.p2]);

  return (
    <div className="w-full h-full bg-black flex items-center justify-center relative overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full" />
      
      {(!joined.p1 || !joined.p2) && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-50 p-6">
          <h1 className="text-6xl font-black text-white italic mb-12 tracking-tighter animate-pulse">PONG TV</h1>
          
          <div className="flex flex-wrap justify-center gap-8">
            <QRCard player={1} roomId={roomId} joined={joined.p1} />
            <QRCard player={2} roomId={roomId} joined={joined.p2} />
          </div>

          <div className="mt-12 flex flex-col items-center gap-4">
            <div className={`px-4 py-2 rounded-full font-bold text-xs tracking-widest uppercase border ${peerStatus === 'ONLINE' ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10' : 'text-red-500 border-red-500/30'}`}>
              KAMER ID: {roomId || '...'} | STATUS: {peerStatus}
            </div>
            
            {/* DEBUG KNOPPEN VOOR AI STUDIO PREVIEW */}
            <div className="flex gap-4">
              <button 
                onClick={() => window.open(`${window.location.origin}${window.location.pathname}?id=${roomId}&p=1`, '_blank')}
                className="text-[10px] text-zinc-500 hover:text-white underline font-bold uppercase tracking-tighter"
              >
                Open P1 in nieuw tabblad (Test)
              </button>
              <button 
                onClick={() => window.open(`${window.location.origin}${window.location.pathname}?id=${roomId}&p=2`, '_blank')}
                className="text-[10px] text-zinc-500 hover:text-white underline font-bold uppercase tracking-tighter"
              >
                Open P2 in nieuw tabblad (Test)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const QRCard: React.FC<{ player: 1|2, roomId: string, joined: boolean }> = ({ player, roomId, joined }) => {
  // We bouwen de URL nu heel expliciet op.
  // We gebruiken de GITHUB_BASE_URL voor de uiteindelijke versie op TV.
  const qrUrl = `${GITHUB_BASE_URL}index.html?id=${roomId}&p=${player}`;

  return (
    <div className={`p-6 rounded-[2.5rem] border-2 transition-all duration-700 flex flex-col items-center w-64 ${joined ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}>
      <div className={`mb-4 text-sm font-black italic ${player === 1 ? 'text-emerald-400' : 'text-blue-400'}`}>SPELER {player}</div>
      <div className="bg-white p-3 rounded-2xl shadow-2xl">
        <img 
          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}&bgcolor=ffffff&color=000000`}
          alt="QR Code"
          className={`w-32 h-32 transition-all duration-1000 ${joined ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`}
        />
        {joined && (
          <div className="absolute inset-0 flex items-center justify-center animate-bounce">
            <span className="text-4xl">✅</span>
          </div>
        )}
      </div>
      <div className={`mt-4 font-bold uppercase tracking-widest text-[10px] ${joined ? 'text-emerald-400' : 'text-zinc-500'}`}>
        {joined ? 'KLAAR VOOR START' : 'SCAN MET TELEFOON'}
      </div>
    </div>
  );
};

// --- MAIN APP ENTRY ---
const App: React.FC = () => {
  const [view, setView] = useState<'LOBBY' | 'TV' | 'CONTROLLER'>('LOBBY');
  const [params, setParams] = useState<{ id: string, p: 1|2 } | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    const p = urlParams.get('p');
    
    if (id && p) {
      setParams({ id, p: p === '2' ? 2 : 1 });
      setView('CONTROLLER');
    }
  }, []);

  if (view === 'CONTROLLER' && params) return <ControllerMode hostId={params.id} player={params.p} />;
  if (view === 'TV') return <TVMode />;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-10 text-center">
      <div className="mb-16">
        <h1 className="text-8xl font-black text-white italic tracking-tighter">PONG</h1>
        <p className="text-emerald-500 font-bold tracking-[0.5em] text-xs mt-2 uppercase">Google TV Streamer</p>
      </div>
      
      <div className="grid gap-6 w-full max-w-sm">
        <button 
          onClick={() => setView('TV')}
          className="bg-white text-black py-8 rounded-[2.5rem] font-black text-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_50px_rgba(255,255,255,0.1)]"
        >
          START GAME OP TV 📺
        </button>
        
        <p className="text-zinc-500 text-[10px] mt-8 uppercase font-bold tracking-widest leading-relaxed">
          Open deze pagina op je Google TV.<br/>
          Scan de QR-codes met je telefoon om te besturen.
        </p>
      </div>

      <div className="absolute bottom-8 text-zinc-700 text-[9px] font-mono">
        v2.0.1 | PeerJS Network Engine
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);

