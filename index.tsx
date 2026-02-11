
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// PeerJS library is geladen via index.html
declare const Peer: any;

// --- CONFIGURATIE ---
const GITHUB_URL = "https://v68799.github.io/PongGamecontroller/index.html";

// --- COMPONENT: CONTROLLER ---
const ControllerMode: React.FC<{ hostId: string; player: 1 | 2 }> = ({ hostId, player }) => {
  const [status, setStatus] = useState<'CONNECTING' | 'CONNECTED' | 'ERROR'>('CONNECTING');
  const connRef = useRef<any>(null);
  const peerRef = useRef<any>(null);

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', () => {
      const conn = peer.connect(hostId);
      connRef.current = conn;
      conn.on('open', () => {
        setStatus('CONNECTED');
        conn.send({ type: 'JOIN', player });
      });
      conn.on('error', () => setStatus('ERROR'));
      conn.on('close', () => setStatus('ERROR'));
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
      <div className="absolute bottom-12 text-white/20 uppercase font-bold text-[10px] tracking-widest">
        Sleep om te bewegen
      </div>
    </div>
  );
};

// --- COMPONENT: TV / GAME ENGINE ---
const TVMode: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [roomId, setRoomId] = useState('');
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

    peer.on('connection', (conn: any) => {
      conn.on('data', (data: any) => {
        if (data.type === 'JOIN') {
          if (data.player === 1) setJoined(j => ({ ...j, p1: true }));
          if (data.player === 2) setJoined(j => ({ ...j, p2: true }));
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

      if (joined.p1 && joined.p2) {
        state.current.ballX += state.current.ballVX;
        state.current.ballY += state.current.ballVY;

        if (state.current.ballY < 0.05 || state.current.ballY > 0.95) state.current.ballVY *= -1;
        
        const paddleH = 0.2;
        if (state.current.ballX < 0.03 && Math.abs(state.current.ballY - state.current.p1Y) < paddleH/2) {
          state.current.ballVX = Math.abs(state.current.ballVX) * 1.1;
        }
        if (state.current.ballX > 0.97 && Math.abs(state.current.ballY - state.current.p2Y) < paddleH/2) {
          state.current.ballVX = -Math.abs(state.current.ballVX) * 1.1;
        }

        if (state.current.ballX < 0) { state.current.p2Score++; resetBall(); }
        if (state.current.ballX > 1) { state.current.p1Score++; resetBall(); }
      }

      function resetBall() {
        state.current.ballX = 0.5; state.current.ballY = 0.5;
        state.current.ballVX = (Math.random() > 0.5 ? 1 : -1) * 0.006;
      }

      // Render
      ctx.fillStyle = '#050505'; ctx.fillRect(0,0,w,h);
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(w/2-2, 0, 4, h);
      
      // Scores
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.font = '900 200px Inter'; ctx.textAlign='center';
      ctx.fillText(state.current.p1Score.toString(), w*0.25, h*0.6);
      ctx.fillText(state.current.p2Score.toString(), w*0.75, h*0.6);

      // Paddles
      ctx.fillStyle = '#10b981'; ctx.fillRect(10, (state.current.p1Y - 0.1) * h, 20, 0.2 * h);
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(w - 30, (state.current.p2Y - 0.1) * h, 20, 0.2 * h);
      
      // Ball
      ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(state.current.ballX * w, state.current.ballY * h, 12, 0, Math.PI*2); ctx.fill();

      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => { peer.destroy(); cancelAnimationFrame(frame); };
  }, [joined]);

  return (
    <div className="w-full h-full bg-black flex items-center justify-center relative overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full" />
      {(!joined.p1 || !joined.p2) && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
          <h1 className="text-6xl font-black text-white italic mb-12 tracking-tighter">PONG TV</h1>
          <div className="flex gap-12">
            <QRCard player={1} roomId={roomId} joined={joined.p1} />
            <QRCard player={2} roomId={roomId} joined={joined.p2} />
          </div>
          <div className="mt-12 text-zinc-500 font-bold tracking-[0.4em] text-xs uppercase">Scan om te spelen</div>
        </div>
      )}
    </div>
  );
};

const QRCard: React.FC<{ player: 1|2, roomId: string, joined: boolean }> = ({ player, roomId, joined }) => (
  <div className={`p-8 rounded-[3rem] border-2 transition-all duration-700 flex flex-col items-center ${joined ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}>
    <div className="mb-6 text-xl font-black text-white italic">SPELER {player}</div>
    <div className="bg-white p-4 rounded-3xl">
      <img 
        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${GITHUB_URL}?id=${roomId}&p=${player}`)}`}
        alt="QR Code"
        className={`w-40 h-40 transition-opacity ${joined ? 'opacity-20 grayscale' : 'opacity-100'}`}
      />
    </div>
    <div className={`mt-6 font-bold uppercase tracking-widest text-xs ${joined ? 'text-emerald-400' : 'text-zinc-500'}`}>
      {joined ? 'READY' : 'WACHTEN...'}
    </div>
  </div>
);

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
        <p className="text-emerald-500 font-bold tracking-[0.5em] text-xs mt-2">CYBERPUNK EDITION</p>
      </div>
      <div className="grid gap-6 w-full max-w-sm">
        <button 
          onClick={() => setView('TV')}
          className="bg-white text-black py-8 rounded-[2.5rem] font-black text-xl hover:scale-105 active:scale-95 transition-all shadow-2xl"
        >
          START ALS TV 📺
        </button>
        <div className="text-zinc-600 text-[10px] uppercase font-bold tracking-widest my-4">— OF —</div>
        <p className="text-zinc-400 text-xs mb-4">Open deze link op je telefoon via de QR-code op je TV.</p>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
