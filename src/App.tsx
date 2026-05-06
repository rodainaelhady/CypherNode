import React from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "motion/react";
import { 
  Shield, 
  Send, 
  Download, 
  Key, 
  FileText, 
  Wifi, 
  Search,
  RefreshCw,
  Lock,
  Box
} from "lucide-react";
import useSocket from "./hooks/useSocket.ts";
import Scene3D from "./components/Scene3D.tsx";

type StepStatus = "idle" | "in-progress" | "done" | "error";

interface Step {
  id: number;
  label: string;
  status: StepStatus;
  icon: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Search,
  FileText,
  Key,
  Send,
  RefreshCw,
  Lock,
  Download,
};

function HoverCard({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width - 0.5;
    const yPct = (e.clientY - rect.top) / rect.height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      id={id}
    >
      <div style={{ transform: "translateZ(30px)" }}>
        {children}
      </div>
    </motion.div>
  );
}

export default function App() {
  const {
    isConnected,
    peerCount,
    statusMessage,
    senderSteps,
    receiverSteps,
    receivedFile,
    joinSession,
    selectFile,
    syncSessionKey,
    transferFile,
    initHandshake,
    mode,
    setMode,
    sessionId,
    setSessionId,
  } = useSocket();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) selectFile(file);
  };

  const handleJoinSession = () => {
    joinSession(sessionId);
  };

  const steps = mode === "sender" ? senderSteps : receiverSteps;

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-cyan-500/30 overflow-x-hidden">
      <Scene3D />

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-16">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/50 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.3)]">
              <Shield className="w-8 h-8 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
                CYPHER.NODE
              </h1>
              <p className="text-cyan-500/60 text-[10px] font-mono tracking-[0.3em] uppercase">Distributed Secure Uplink</p>
            </div>
          </motion.div>

          <div className="flex gap-1 p-1 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl">
            <button 
              onClick={() => setMode("sender")}
              className={`px-6 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all ${mode === "sender" ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.5)]" : "text-white/40 hover:text-white hover:bg-white/5"}`}
            >
              UPLINK
            </button>
            <button 
              onClick={() => setMode("receiver")}
              className={`px-6 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all ${mode === "receiver" ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.5)]" : "text-white/40 hover:text-white hover:bg-white/5"}`}
            >
              DOWNLINK
            </button>
          </div>
        </header>

        {/* Configuration Bar */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 mb-12 shadow-2xl"
        >
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="relative flex-1 w-full group">
              <Box className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-500/50 group-focus-within:text-cyan-400 transition-colors" />
              <input 
                type="text" 
                placeholder="CLUSTER SESSION IDENTIFIER"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value.toUpperCase())}
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-6 font-mono text-sm tracking-widest focus:outline-none focus:border-cyan-500/50 focus:bg-black/60 transition-all placeholder:text-white/20"
              />
            </div>
            <button 
              onClick={handleJoinSession}
              disabled={!sessionId}
              className="w-full md:w-auto px-10 py-4 bg-cyan-500 text-black font-black text-sm tracking-widest rounded-2xl hover:bg-cyan-400 transition-all flex items-center justify-center gap-3 disabled:opacity-20 active:scale-95 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
            >
              INITIALIZE
              <Wifi className={`w-5 h-5 ${isConnected ? "text-blue-900" : "text-red-900"}`} />
            </button>
          </div>
        </motion.section>

        {/* Action Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 perspective-1000">
          {steps.map((step) => {
            const IconComponent = ICON_MAP[step.icon] || Search;
            return (
              <HoverCard 
                key={step.id}
                className="group cursor-default"
                id={`step-${step.id}`}
              >
                <div className={`h-full relative p-6 rounded-3xl border transition-all duration-500 ${
                  step.status === "done" ? "bg-cyan-500/10 border-cyan-500/50" :
                  step.status === "in-progress" ? "bg-white/5 border-cyan-400/50 animate-pulse shadow-[0_0_30px_rgba(6,182,212,0.2)]" :
                  step.status === "error" ? "bg-red-500/10 border-red-500/50" :
                  "bg-white/5 border-white/10 hover:border-white/20"
                }`}>
                  <div className="mb-6 flex justify-between items-start">
                    <div className={`p-3 rounded-2xl ${
                      step.status === "done" ? "bg-cyan-500 text-black" :
                      step.status === "in-progress" ? "bg-cyan-400 text-black" :
                      step.status === "error" ? "bg-red-500 text-black" :
                      "bg-white/10 text-white/40"
                    }`}>
                      <IconComponent className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-black font-mono text-white/20 uppercase tracking-tighter">LVL {step.id}</span>
                  </div>
                  
                  <h3 className="text-sm font-black mb-2 tracking-wide uppercase italic">
                    {step.label}
                  </h3>
                  
                  <div className="flex items-center gap-2 mb-6">
                    <div className={`w-1.5 h-1.5 rounded-full blur-[1px] ${
                      step.status === "done" ? "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)]" :
                      step.status === "in-progress" ? "bg-cyan-300 animate-pulse" :
                      step.status === "error" ? "bg-red-400 shadow-[0_0_10px_rgba(239,68,68,1)]" :
                      "bg-white/20"
                    }`} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${
                      step.status === "done" ? "text-cyan-400" :
                      step.status === "in-progress" ? "text-cyan-300" :
                      step.status === "error" ? "text-red-400" :
                      "text-white/20"
                    }`}>
                      {step.status === "idle" ? "WAITING" : step.status === "error" ? "ERROR" : step.status}
                    </span>
                  </div>

                  <div className="mt-auto">
                    {mode === "sender" && step.id === 2 && step.status !== "done" && (
                      <label className="cursor-pointer block w-full text-center py-3 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] font-black tracking-widest transition-all">
                        FILE_LOCATE
                        <input type="file" className="hidden" onChange={handleFileSelect} />
                      </label>
                    )}
                    {mode === "sender" && step.id === 3 && senderSteps[1].status === "done" && step.status !== "done" && (
                      <button 
                        onClick={syncSessionKey}
                        className="w-full py-3 bg-cyan-500 text-black rounded-xl text-[10px] font-black tracking-widest transition-all hover:bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                      >
                        SYNC_VECTOR
                      </button>
                    )}
                    {mode === "sender" && step.id === 4 && senderSteps[2].status === "done" && step.status !== "done" && (
                      <button 
                        onClick={transferFile}
                        className="w-full py-3 bg-cyan-500 text-black rounded-xl text-[10px] font-black tracking-widest transition-all hover:bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                      >
                        EXEC_UPLINK
                      </button>
                    )}
                    {mode === "receiver" && step.id === 1 && step.status !== "done" && (
                      <button 
                        onClick={initHandshake}
                        className="w-full py-3 bg-cyan-500 text-black rounded-xl text-[10px] font-black tracking-widest transition-all hover:bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                      >
                        GEN_CRYPTO
                      </button>
                    )}
                  </div>
                </div>
              </HoverCard>
            );
          })}
        </div>

        {/* Footer Info Area */}
        <section className="mt-16">
          <div className="bg-black/40 backdrop-blur-3xl border border-white/10 p-6 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-cyan-400 shadow-[0_0_10px_cyan]" : "bg-red-500 animate-ping"}`} />
              </div>
              <p className="text-xs font-mono text-cyan-400/80 tracking-tighter uppercase">
                <span className="text-white/20">LOG //</span> {statusMessage}
              </p>
              {peerCount > 0 && (
                <span className="text-[10px] font-mono text-cyan-500/50 tracking-widest">
                  PEERS: {peerCount}
                </span>
              )}
            </div>
            
            <AnimatePresence>
              {receivedFile && (
                <motion.a 
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  whileHover={{ scale: 1.05 }}
                  href={receivedFile.data}
                  download={receivedFile.name}
                  className="flex items-center gap-3 px-6 py-3 bg-white text-black rounded-2xl text-xs font-black tracking-widest transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                >
                  <Download className="w-5 h-5" />
                  DOWNLOAD_PAYLOAD
                </motion.a>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>
    </div>
  );
}
