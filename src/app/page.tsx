"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Square, Loader2, RotateCcw, Download, Archive, X, ChevronLeft, ChevronRight, Share2, FileText, ClipboardList, Crosshair, Search, RefreshCw, Pencil, Eraser, Play, Pause } from 'lucide-react';
import { detectImpacts } from '@/utils/audioProcessor';
import { processSwings } from '@/utils/videoProcessor';
import JSZip from 'jszip';

export default function Home() {
  // App states: 'camera' | 'processing' | 'gallery'
  const [appState, setAppState] = useState<'camera' | 'processing' | 'gallery'>('camera');
  
  // Camera & Recording
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [ballPosition, setBallPosition] = useState({ x: 50, y: 75 }); 
  
  // Processing
  const [progressText, setProgressText] = useState('');
  
  // Gallery
  const [clips, setClips] = useState<string[]>([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);
  const [sessionNotes, setSessionNotes] = useState('');
  const [shotNotes, setShotNotes] = useState<string[]>([]);
  const [showImpactZoom, setShowImpactZoom] = useState(false);

  // Telestrator (Drawing) State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState('#22c55e'); // Green

  // Player state
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const wasPlayingBeforeScrub = useRef(false);

  const togglePlay = () => {
    if (mainVideoRef.current) {
      if (mainVideoRef.current.paused) {
        mainVideoRef.current.play();
        setIsPlaying(true);
      } else {
        mainVideoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (mainVideoRef.current && !isScrubbing) {
      setCurrentTime(mainVideoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (mainVideoRef.current) {
      setDuration(mainVideoRef.current.duration);
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (mainVideoRef.current) {
      mainVideoRef.current.currentTime = time;
    }
  };

  const handleScrubStart = () => {
    if (mainVideoRef.current) {
      wasPlayingBeforeScrub.current = !mainVideoRef.current.paused;
      mainVideoRef.current.pause();
      setIsScrubbing(true);
    }
  };

  const handleScrubEnd = () => {
    setIsScrubbing(false);
    if (wasPlayingBeforeScrub.current && mainVideoRef.current) {
      mainVideoRef.current.play();
    }
  };

  useEffect(() => {
    if (selectedClipIndex !== null) {
      setIsPlaying(true);
      setCurrentTime(0);
    }
  }, [selectedClipIndex]);

  // Synchronized Inset Video logic
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const insetVideoRef = useRef<HTMLVideoElement>(null);

  // Handle Drawing Logic
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  useEffect(() => {
    const main = mainVideoRef.current;
    const inset = insetVideoRef.current;

    if (selectedClipIndex !== null && showImpactZoom && main && inset) {
      inset.currentTime = main.currentTime;
      const handleSync = () => { if (Math.abs(inset.currentTime - main.currentTime) > 0.1) inset.currentTime = main.currentTime; };
      const handlePlay = () => inset.play().catch(() => {});
      const handlePause = () => inset.pause();
      main.addEventListener('play', handlePlay);
      main.addEventListener('pause', handlePause);
      main.addEventListener('timeupdate', handleSync);
      main.addEventListener('seeking', handleSync);
      if (!main.paused) handlePlay();
      return () => {
        main.removeEventListener('play', handlePlay);
        main.removeEventListener('pause', handlePause);
        main.removeEventListener('timeupdate', handleSync);
        main.removeEventListener('seeking', handleSync);
      };
    }
  }, [selectedClipIndex, showImpactZoom, clips]);

  const startCamera = useCallback(async () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error("Error accessing camera", err);
      alert("Could not access camera. Please allow camera and microphone permissions.");
    }
  }, [facingMode]);

  useEffect(() => {
    if (appState === 'camera') startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [appState, startCamera]);

  const toggleCamera = () => { if (!isRecording) setFacingMode(prev => prev === 'user' ? 'environment' : 'user'); };

  const updateBallPosition = (clientX: number, clientY: number, target: HTMLDivElement) => {
    if (isRecording) return;
    const rect = target.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    setBallPosition({ x, y });
  };

  const handleCameraInteraction = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (isRecording) return;
    
    // For MouseEvents, only update if button is down (dragging) or it's a click
    if ('buttons' in e && e.type === 'mousemove' && e.buttons !== 1) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    updateBallPosition(clientX, clientY, e.currentTarget);
  };

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    const stream = streamRef.current;
    const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm;codecs=vp8,opus';
    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = mediaRecorder;
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const fullVideoBlob = new Blob(chunks, { type: mediaRecorder.mimeType });
      setAppState('processing');
      setProgressText('Analyzing audio for impacts...');
      try {
        const impacts = await detectImpacts(fullVideoBlob);
        if (impacts.length === 0) {
          alert("No swings detected. Try again and make sure the impact is loud.");
          setAppState('camera');
          return;
        }
        setProgressText(`Found ${impacts.length} swings. Processing clips...`);
        const generatedClips = await processSwings(fullVideoBlob, impacts, setProgressText);
        setClips(generatedClips);
        setShotNotes(new Array(generatedClips.length).fill(''));
        setAppState('gallery');
      } catch (err) {
        console.error("Processing error:", err);
        alert("Error processing video.");
        setAppState('camera');
      }
    };
    setTimeout(() => {
      mediaRecorder.start(200); 
      setIsRecording(true);
    }, 100);
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const resetApp = () => {
    if (confirm("Are you sure you want to start a new session? Current clips will be cleared.")) {
      clips.forEach(url => URL.revokeObjectURL(url));
      setClips([]);
      setSelectedClipIndex(null);
      setSessionNotes('');
      setShotNotes([]);
      setAppState('camera');
    }
  };

  const updateShotNote = (index: number, text: string) => {
    const newNotes = [...shotNotes];
    newNotes[index] = text;
    setShotNotes(newNotes);
  };

  const downloadClip = (url: string, index: number) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `swing_${index + 1}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const shareClip = async (url: string, index: number) => {
    try {
      if (!navigator.share) { alert("Sharing not supported."); return; }
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], `swing_${index + 1}.webm`, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `SwingClips #${index + 1}`, text: 'Check out my swing!', });
      }
    } catch (err) { if ((err as any).name !== 'AbortError') console.error("Error sharing:", err); }
  };

  const downloadAllAsZip = async () => {
    const originalText = progressText;
    setProgressText("Creating ZIP archive...");
    setAppState('processing');
    const zip = new JSZip();
    for (let i = 0; i < clips.length; i++) {
      const response = await fetch(clips[i]);
      const blob = await response.blob();
      zip.file(`swing_${i + 1}.webm`, blob);
    }
    let reportText = `GOLF SESSION REPORT - ${new Date().toLocaleString()}\n`;
    reportText += `==========================================\n\n`;
    reportText += `SESSION NOTES:\n${sessionNotes || "No notes."}\n\n`;
    shotNotes.forEach((note, idx) => {
      reportText += `SWING #${idx + 1}:\n${note || "No notes."}\n\n`;
    });
    zip.file("session_report.txt", reportText);
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `golf_session_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setProgressText(originalText);
    setAppState('gallery');
  };

  return (
    <main className="fixed inset-0 bg-black text-white flex flex-col font-sans overflow-hidden select-none">
      
      {appState === 'camera' && (
        <div 
          className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden touch-none" 
          onMouseDown={handleCameraInteraction}
          onMouseMove={handleCameraInteraction}
          onTouchMove={handleCameraInteraction}
          onTouchStart={handleCameraInteraction}
        >
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover absolute inset-0 z-0" />
          {!isRecording && (
            <div className="absolute z-10 flex flex-col items-center pointer-events-none transition-all duration-300" style={{ left: `${ballPosition.x}%`, top: `${ballPosition.y}%`, transform: 'translate(-50%, -50%)' }}>
               <div className="w-16 h-16 border-2 border-dashed border-blue-400 rounded-full flex items-center justify-center animate-pulse bg-blue-400/10"><Crosshair className="w-6 h-6 text-blue-400" /></div>
               <span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-blue-400 bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">Align Ball</span>
            </div>
          )}
          <div className="absolute inset-x-0 top-0 p-6 z-10 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
             <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-md">SwingClips</h1>
             <div className="flex flex-col items-end gap-3">
               {!isRecording && <button onClick={(e) => { e.stopPropagation(); toggleCamera(); }} className="p-3 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md border border-white/10 shadow-lg transition-all active:scale-90"><RefreshCw className="w-6 h-6 text-white" /></button>}
               {!isRecording && <div className="text-[10px] bg-blue-600/80 px-2 py-1 rounded text-white font-bold uppercase shadow-lg">Tap Screen to Set Ball Position</div>}
             </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 pb-12 pt-24 bg-gradient-to-t from-black/80 to-transparent z-10 flex flex-col items-center justify-end">
            {isRecording && <div className="mb-6 flex items-center space-x-2 text-red-500 font-bold animate-pulse"><div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div><span className="drop-shadow-md uppercase tracking-widest text-xs text-white">Recording</span></div>}
            <button onClick={(e) => { e.stopPropagation(); isRecording ? stopRecording() : startRecording(); }} className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 ${isRecording ? "bg-red-500 scale-90" : "bg-white hover:bg-gray-200"}`}>{isRecording ? <Square className="text-white w-8 h-8 fill-current" /> : <div className="w-16 h-16 rounded-full border-4 border-black/10 bg-red-500 flex items-center justify-center"><Video className="text-white w-8 h-8" /></div>}</button>
          </div>
        </div>
      )}

      {appState === 'processing' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-20 bg-gray-900">
          <Loader2 className="w-16 h-16 animate-spin text-blue-500 mb-6" />
          <h2 className="text-2xl font-bold mb-2 uppercase tracking-tighter text-white">Processing</h2>
          <p className="text-gray-400 font-medium px-4 py-2 bg-black/40 rounded-lg">{progressText}</p>
        </div>
      )}

      {appState === 'gallery' && (
        <div className="flex-1 flex flex-col bg-gray-950 z-20 overflow-hidden">
          <div className="p-4 pt-8 flex items-center justify-between border-b border-gray-800 bg-gray-900 shadow-md">
             <div><h1 className="text-lg font-bold text-white">Session Gallery</h1><p className="text-xs text-gray-400">{clips.length} swings captured</p></div>
             <div className="flex gap-2">
               <button onClick={downloadAllAsZip} className="p-2 px-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"><Archive className="w-4 h-4 text-white" /><span className="text-sm font-semibold text-white">ZIP All</span></button>
               <button onClick={resetApp} className="p-2 px-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"><RotateCcw className="w-4 h-4 text-gray-300" /><span className="text-sm font-semibold text-gray-300">New</span></button>
             </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-950">
             <div className="p-4 max-w-7xl mx-auto w-full">
               <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-6 shadow-lg">
                  <div className="flex items-center gap-2 mb-2 text-blue-400"><ClipboardList className="w-5 h-5" /><h3 className="font-bold text-sm uppercase tracking-wider text-blue-400">Overall Session Notes</h3></div>
                  <textarea value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} placeholder="e.g. Club: 7-Iron, Focus: Keeping head still..." className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder:text-gray-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all min-h-[80px]" />
               </div>
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {clips.map((clipUrl, idx) => (
                    <div key={idx} onClick={() => setSelectedClipIndex(idx)} className="relative group bg-gray-900 rounded-xl overflow-hidden shadow-xl border border-gray-800 cursor-pointer active:scale-95 transition-transform">
                      <div className="aspect-[3/4] bg-black relative"><video src={clipUrl} className="w-full h-full object-cover pointer-events-none" muted playsInline />{shotNotes[idx] && <div className="absolute top-2 right-2 bg-blue-600 p-1 rounded shadow-lg"><FileText className="w-3 h-3 text-white" /></div>}</div>
                      <div className="p-3 flex items-center justify-between bg-gray-900/90 backdrop-blur-sm border-t border-gray-800"><span className="text-xs font-bold text-gray-400">Swing #{idx + 1}</span><div className="flex gap-2"><button onClick={(e) => { e.stopPropagation(); shareClip(clipUrl, idx); }} className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-md text-green-400 transition-colors"><Share2 className="w-4 h-4" /></button><button onClick={(e) => { e.stopPropagation(); downloadClip(clipUrl, idx); }} className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-md text-blue-400 transition-colors"><Download className="w-4 h-4" /></button></div></div>
                    </div>
                  ))}
               </div>
             </div>
          </div>

          {selectedClipIndex !== null && (
            <div className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden">
              <div className="p-6 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent absolute top-0 inset-x-0 z-50">
                <div className="flex flex-col text-white">
                  <h2 className="text-lg font-bold">Swing {selectedClipIndex + 1} of {clips.length}</h2>
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => setShowImpactZoom(!showImpactZoom)} className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${showImpactZoom ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}><Search className="w-3 h-3" /> Zoom {showImpactZoom ? 'ON' : 'OFF'}</button>
                    <button onClick={clearCanvas} className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-800 text-gray-400 hover:text-white transition-colors"><Eraser className="w-3 h-3" /> Clear Ink</button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={(e) => { e.stopPropagation(); shareClip(clips[selectedClipIndex!], selectedClipIndex!); }} className="p-3 bg-green-600 rounded-full text-white shadow-lg active:scale-90 transition-transform"><Share2 className="w-5 h-5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); downloadClip(clips[selectedClipIndex!], selectedClipIndex!); }} className="p-3 bg-blue-600 rounded-full text-white shadow-lg active:scale-90 transition-transform"><Download className="w-5 h-5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setSelectedClipIndex(null); }} className="p-3 bg-gray-800 rounded-full text-white shadow-lg active:scale-90 transition-transform"><X className="w-5 h-5" /></button>
                </div>
              </div>

              <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
                <video 
                  ref={mainVideoRef} 
                  key={clips[selectedClipIndex]} 
                  src={clips[selectedClipIndex]} 
                  autoPlay 
                  loop 
                  playsInline 
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  className="w-full h-full object-cover absolute inset-0 z-0" 
                />
                
                {/* Telestrator Canvas */}
                <canvas
                  ref={canvasRef}
                  width={typeof window !== 'undefined' ? window.innerWidth : 1920}
                  height={typeof window !== 'undefined' ? window.innerHeight : 1080}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="absolute inset-0 z-30 cursor-crosshair touch-none"
                />

                {/* Custom Video Controls */}
                <div className="absolute bottom-6 inset-x-0 z-40 px-6 pointer-events-none">
                  <div className="max-w-3xl mx-auto w-full flex flex-col gap-2 pointer-events-auto">
                    {/* Scrubber */}
                    <div className="w-full flex items-center gap-3 bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-2xl">
                      <button 
                        onClick={togglePlay} 
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors active:scale-90"
                      >
                        {isPlaying ? <Pause className="w-5 h-5 text-white fill-current" /> : <Play className="w-5 h-5 text-white fill-current translate-x-0.5" />}
                      </button>
                      
                      <div className="flex-1 flex items-center group relative h-6">
                        <input 
                          type="range"
                          min="0"
                          max={duration || 0}
                          step="0.001"
                          value={currentTime}
                          onChange={handleScrub}
                          onMouseDown={handleScrubStart}
                          onMouseUp={handleScrubEnd}
                          onTouchStart={handleScrubStart}
                          onTouchEnd={handleScrubEnd}
                          className="w-full h-1.5 bg-gray-600 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all focus:outline-none"
                        />
                        {/* Custom Progress Bar background to show "filled" portion */}
                        <div 
                          className="absolute left-0 top-[10px] h-1.5 bg-blue-500 rounded-full pointer-events-none"
                          style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                        />
                      </div>
                      
                      <span className="text-[10px] font-mono text-gray-300 w-16 text-right">
                        {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
                      </span>
                    </div>
                  </div>
                </div>

                {showImpactZoom && (
                  <div className="absolute top-24 left-6 w-32 h-32 md:w-64 md:h-64 rounded-xl border-2 border-blue-500 overflow-hidden shadow-2xl z-40 bg-black animate-in zoom-in duration-300 ring-4 ring-black/50">
                     <video ref={insetVideoRef} src={clips[selectedClipIndex]} muted playsInline className="w-full h-full object-cover" style={{ transform: 'scale(8)', transformOrigin: `${ballPosition.x}% ${ballPosition.y}%`, imageRendering: 'pixelated' }} />
                     <div className="absolute bottom-1 right-1 bg-blue-600 text-[10px] font-bold px-2 py-0.5 rounded text-white uppercase tracking-tighter shadow-lg">Impact Zone (8x)</div>
                  </div>
                )}

                <div className="absolute inset-x-4 flex items-center justify-between pointer-events-none z-40">
                  <button disabled={selectedClipIndex === 0} onClick={(e) => { e.stopPropagation(); setSelectedClipIndex(selectedClipIndex - 1); }} className={`p-4 bg-black/50 rounded-full text-white pointer-events-auto backdrop-blur-md transition-all active:scale-90 ${selectedClipIndex === 0 ? 'opacity-0 invisible' : 'opacity-100 visible'}`}><ChevronLeft className="w-8 h-8" /></button>
                  <button disabled={selectedClipIndex === clips.length - 1} onClick={(e) => { e.stopPropagation(); setSelectedClipIndex(selectedClipIndex + 1); }} className={`p-4 bg-black/50 rounded-full text-white pointer-events-auto backdrop-blur-md transition-all active:scale-90 ${selectedClipIndex === clips.length - 1 ? 'opacity-0 invisible' : 'opacity-100 visible'}`}><ChevronRight className="w-8 h-8" /></button>
                </div>
              </div>

              <div className="p-6 bg-gray-950 border-t border-gray-800 animate-in slide-in-from-bottom duration-300 z-40">
                <div className="flex items-center gap-2 mb-3 text-blue-400"><FileText className="w-5 h-5" /><h3 className="font-bold text-sm uppercase tracking-wider text-blue-400">Swing Notes</h3></div>
                <textarea value={shotNotes[selectedClipIndex]} onChange={(e) => updateShotNote(selectedClipIndex, e.target.value)} placeholder="Record feedback for this swing..." className="w-full bg-black border border-gray-800 rounded-xl p-4 text-gray-200 placeholder:text-gray-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all min-h-[100px]" />
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
