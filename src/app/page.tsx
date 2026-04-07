"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Square, Loader2, RotateCcw, Download, Archive, X, ChevronLeft, ChevronRight, Share2, FileText, ClipboardList, RefreshCw, Eraser, Play, Pause, Gauge, History, Trash2, Circle as CircleIcon, MoveRight, SkipBack, SkipForward } from 'lucide-react';
import { detectImpacts } from '@/utils/audioProcessor';
import { processSwings } from '@/utils/videoProcessor';
import { Session, getAllSessions, saveSession, deleteSession } from '@/utils/db';
import JSZip from 'jszip';

export default function Home() {
  // App states: 'camera' | 'processing' | 'gallery' | 'history'
  const [appState, setAppState] = useState<'camera' | 'processing' | 'gallery' | 'history'>('camera');
  
  // Camera & Recording
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  
  // Processing
  const [progressText, setProgressText] = useState('');
  
  // Persistence & History
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);

  // Gallery
  const [clips, setClips] = useState<string[]>([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [shotNotes, setShotNotes] = useState<string[]>([]);
  const [showNotes, setShowNotes] = useState(false);

  // Drawing Tool State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawMode, setDrawMode] = useState<'line' | 'circle'>('line');
  const [shapes, setShapes] = useState<{type: 'line' | 'circle', start: {x: number, y: number}, end: {x: number, y: number}}[]>([]);
  const [currentShape, setCurrentShape] = useState<{type: 'line' | 'circle', start: {x: number, y: number}, end: {x: number, y: number}} | null>(null);
  const [draggedHandle, setDraggedHandle] = useState<{shapeIndex: number, handle: 'start' | 'end'} | null>(null);
  const [drawColor] = useState('#22c55e'); // Green

  // Redraw canvas whenever lines change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    const drawShape = (s: {type: 'line' | 'circle', start: {x: number, y: number}, end: {x: number, y: number}}, isCurrent = false) => {
      ctx.beginPath();
      if (s.type === 'line') {
        ctx.moveTo(s.start.x, s.start.y);
        ctx.lineTo(s.end.x, s.end.y);
      } else {
        const radius = Math.sqrt((s.end.x - s.start.x) ** 2 + (s.end.y - s.start.y) ** 2);
        ctx.arc(s.start.x, s.start.y, radius, 0, Math.PI * 2);
      }
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw handles
      const drawHandle = (p: {x: number, y: number}) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = isCurrent ? '#3b82f6' : 'white'; 
        ctx.fill();
        ctx.strokeStyle = drawColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      };

      drawHandle(s.start);
      drawHandle(s.end);
    };

    shapes.forEach((s) => drawShape(s));
    if (currentShape) drawShape(currentShape, true);
  }, [shapes, currentShape, drawColor]);

  // Handle Drawing Logic
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    // Check if we're grabbing an existing handle
    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i];
      const distStart = Math.sqrt((x - s.start.x) ** 2 + (y - s.start.y) ** 2);
      const distEnd = Math.sqrt((x - s.end.x) ** 2 + (y - s.end.y) ** 2);

      if (distStart < 15) {
        setDraggedHandle({ shapeIndex: i, handle: 'start' });
        return;
      }
      if (distEnd < 15) {
        setDraggedHandle({ shapeIndex: i, handle: 'end' });
        return;
      }
    }

    // Otherwise, start a new shape
    setCurrentShape({ type: drawMode, start: { x, y }, end: { x, y } });
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    if (draggedHandle) {
      const newShapes = [...shapes];
      const s = newShapes[draggedHandle.shapeIndex];
      if (draggedHandle.handle === 'start') {
        s.start = { x, y };
      } else {
        s.end = { x, y };
      }
      setShapes(newShapes);
    } else if (currentShape) {
      setCurrentShape({ ...currentShape, end: { x, y } });
    }
  };

  const stopDrawing = () => {
    if (currentShape) {
      setShapes([...shapes, currentShape]);
      setCurrentShape(null);
    }
    setDraggedHandle(null);
  };

  const clearCanvas = () => {
    setShapes([]);
    setCurrentShape(null);
  };

  // Player state
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
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

  const togglePlaybackRate = () => {
    const newRate = playbackRate === 1 ? 0.25 : 1;
    setPlaybackRate(newRate);
    if (mainVideoRef.current) {
      mainVideoRef.current.playbackRate = newRate;
    }
  };

  const stepFrame = (delta: number) => {
    if (mainVideoRef.current) {
      mainVideoRef.current.pause();
      setIsPlaying(false);
      const newTime = Math.max(0, Math.min(duration, mainVideoRef.current.currentTime + delta));
      mainVideoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
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
      setPlaybackRate(1);
    }
  }, [selectedClipIndex]);

  // DB Operations
  const loadHistory = async () => {
    try {
      const data = await getAllSessions();
      setSessions(data);
    } catch (err) {
      console.error("Error loading history:", err);
    }
  };

  const persistSession = async (clipUrls: string[], notes: string[]) => {
    try {
      const clipBlobs = await Promise.all(clipUrls.map(async (url, idx) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return { blob, shotNote: notes[idx] || '' };
      }));

      const sessionId = Date.now();
      const newSession: Session = {
        id: sessionId,
        date: new Date(),
        sessionName: '',
        sessionNotes: '',
        clips: clipBlobs
      };

      await saveSession(newSession);
      setCurrentSessionId(sessionId);
      await loadHistory();
    } catch (err) {
      console.error("Error persisting session:", err);
    }
  };

  const updateNotesInDB = useCallback(async () => {
    if (currentSessionId === null) return;
    try {
      // Find session to get its existing blobs
      const allSessions = await getAllSessions();
      const currentSession = allSessions.find(s => s.id === currentSessionId);
      if (!currentSession) return;

      const updatedSession: Session = {
        ...currentSession,
        sessionName,
        sessionNotes,
        clips: currentSession.clips.map((clip, idx) => ({
          ...clip,
          shotNote: shotNotes[idx] || ''
        }))
      };
      await saveSession(updatedSession);
    } catch (err) {
      console.error("Error updating notes in DB:", err);
    }
  }, [currentSessionId, sessionName, sessionNotes, shotNotes]);

  // Debounce note syncing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (appState === 'gallery') updateNotesInDB();
    }, 1000);
    return () => clearTimeout(timer);
  }, [sessionName, sessionNotes, shotNotes, updateNotesInDB, appState]);

  const loadSession = (session: Session) => {
    // Clear old URLs
    clips.forEach(url => URL.revokeObjectURL(url));
    
    const newUrls = session.clips.map(c => URL.createObjectURL(c.blob));
    const newShotNotes = session.clips.map(c => c.shotNote);
    
    setClips(newUrls);
    setShotNotes(newShotNotes);
    setSessionName(session.sessionName || '');
    setSessionNotes(session.sessionNotes);
    setCurrentSessionId(session.id);
    setAppState('gallery');
  };

  const deleteHistorySession = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm("Delete this session forever?")) {
      await deleteSession(id);
      await loadHistory();
      if (currentSessionId === id) {
        setClips([]);
        setShotNotes([]);
        setSessionNotes('');
        setCurrentSessionId(null);
      }
    }
  };

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

  useEffect(() => {
    loadHistory();
  }, []);

  const toggleCamera = () => { if (!isRecording) setFacingMode(prev => prev === 'user' ? 'environment' : 'user'); };

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
        const initialNotes = new Array(generatedClips.length).fill('');
        setShotNotes(initialNotes);
        await persistSession(generatedClips, initialNotes);
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
        <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover absolute inset-0 z-0" />
          <div className="absolute inset-x-0 top-0 p-6 z-10 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
             <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-md">SwingClips</h1>
             <div className="flex flex-col items-end gap-3">
               {!isRecording && (
                <div className="flex gap-3">
                  <button onClick={() => { loadHistory(); setAppState('history'); }} className="p-3 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md border border-white/10 shadow-lg transition-all active:scale-90"><History className="w-6 h-6 text-white" /></button>
                  <button onClick={toggleCamera} className="p-3 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md border border-white/10 shadow-lg transition-all active:scale-90"><RefreshCw className="w-6 h-6 text-white" /></button>
                </div>
               )}
             </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 pb-12 pt-24 bg-gradient-to-t from-black/80 to-transparent z-10 flex flex-col items-center justify-end">
            {isRecording && <div className="mb-6 flex items-center space-x-2 text-red-500 font-bold animate-pulse"><div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div><span className="drop-shadow-md uppercase tracking-widest text-xs text-white">Recording</span></div>}
            <button onClick={isRecording ? stopRecording : startRecording} className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 ${isRecording ? "bg-red-500 scale-90" : "bg-white hover:bg-gray-200"}`}>{isRecording ? <Square className="text-white w-8 h-8 fill-current" /> : <div className="w-16 h-16 rounded-full border-4 border-black/10 bg-red-500 flex items-center justify-center"><Video className="text-white w-8 h-8" /></div>}</button>
          </div>
        </div>
      )}

      {appState === 'history' && (
        <div className="flex-1 flex flex-col bg-gray-950 z-20 overflow-hidden">
          <div className="p-4 pt-8 flex items-center justify-between border-b border-gray-800 bg-gray-900 shadow-md">
             <div className="flex items-center gap-3">
               <button onClick={() => setAppState('camera')} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400"><ChevronLeft className="w-5 h-5" /></button>
               <div><h1 className="text-lg font-bold text-white">History</h1><p className="text-xs text-gray-400">{sessions.length} sessions saved</p></div>
             </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <History className="w-12 h-12 mb-4 opacity-20" />
                <p>No saved sessions yet.</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div key={session.id} onClick={() => loadSession(session)} className="bg-gray-900 rounded-xl p-4 border border-gray-800 shadow-lg cursor-pointer hover:border-blue-500/50 transition-all active:scale-[0.98]">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-white">{session.sessionName || new Date(session.id).toLocaleDateString()}</h3>
                      <p className="text-xs text-gray-500">{session.sessionName ? new Date(session.id).toLocaleDateString() + ' • ' : ''}{new Date(session.id).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {session.clips.length} swings</p>
                    </div>
                    <button onClick={(e) => deleteHistorySession(e, session.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  {session.sessionNotes && (
                    <p className="text-xs text-gray-400 line-clamp-2 bg-black/30 p-2 rounded italic">"{session.sessionNotes}"</p>
                  )}
                  <div className="flex gap-2 mt-3 overflow-hidden h-12">
                    {session.clips.slice(0, 5).map((clip, idx) => (
                      <div key={idx} className="aspect-[3/4] h-full bg-black rounded overflow-hidden border border-gray-800">
                        <video src={URL.createObjectURL(clip.blob)} className="w-full h-full object-cover" />
                      </div>
                    ))}
                    {session.clips.length > 5 && (
                      <div className="h-full aspect-square bg-gray-800 rounded flex items-center justify-center text-[10px] font-bold text-gray-500">+{session.clips.length - 5}</div>
                    )}
                  </div>
                </div>
              ))
            )}
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
               <button onClick={() => { loadHistory(); setAppState('history'); }} className="p-2 px-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"><History className="w-4 h-4 text-gray-300" /><span className="text-sm font-semibold text-gray-300">History</span></button>
               <button onClick={downloadAllAsZip} className="p-2 px-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"><Archive className="w-4 h-4 text-white" /><span className="text-sm font-semibold text-white">ZIP All</span></button>
               <button onClick={resetApp} className="p-2 px-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"><RotateCcw className="w-4 h-4 text-gray-300" /><span className="text-sm font-semibold text-gray-300">New</span></button>
             </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-950">
             <div className="p-4 max-w-7xl mx-auto w-full">
               <div className="flex flex-col md:flex-row gap-4 mb-6">
                 <div className="flex-1 bg-gray-900 rounded-xl p-4 border border-gray-800 shadow-lg">
                    <div className="flex items-center gap-2 mb-2 text-blue-400"><FileText className="w-5 h-5" /><h3 className="font-bold text-sm uppercase tracking-wider text-blue-400">Session Name</h3></div>
                    <input type="text" value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="e.g. 7-Iron Drills..." className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder:text-gray-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
                 </div>
                 <div className="flex-1 bg-gray-900 rounded-xl p-4 border border-gray-800 shadow-lg">
                    <div className="flex items-center gap-2 mb-2 text-blue-400"><ClipboardList className="w-5 h-5" /><h3 className="font-bold text-sm uppercase tracking-wider text-blue-400">Overall Session Notes</h3></div>
                    <textarea value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} placeholder="e.g. Focus: Keeping head still..." className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder:text-gray-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all min-h-[45px]" />
                 </div>
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
            <div className="fixed inset-0 z-50 bg-black overflow-hidden select-none">
              
              {/* Fullscreen Video Container */}
              <div className="absolute inset-0 bg-black overflow-hidden">
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
                <div className="absolute bottom-10 inset-x-0 z-40 px-6 pointer-events-none">
                  <div className="max-w-3xl mx-auto w-full flex flex-col gap-2 pointer-events-auto">
                    {/* Scrubber */}
                    <div className="w-full flex items-center gap-3 bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-2xl">
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => stepFrame(-1/60)} 
                          className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                          title="Previous Frame"
                        >
                          <SkipBack className="w-4 h-4" />
                        </button>
                        
                        <button 
                          onClick={togglePlay} 
                          className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors active:scale-90"
                        >
                          {isPlaying ? <Pause className="w-5 h-5 text-white fill-current" /> : <Play className="w-5 h-5 text-white fill-current translate-x-0.5" />}
                        </button>

                        <button 
                          onClick={() => stepFrame(1/60)} 
                          className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                          title="Next Frame"
                        >
                          <SkipForward className="w-4 h-4" />
                        </button>
                      </div>
                      
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

                      <button 
                        onClick={togglePlaybackRate} 
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all active:scale-90 border ${playbackRate === 0.25 ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/50 border-white/10 text-gray-300'}`}
                      >
                        <Gauge className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold">{playbackRate === 1 ? '1x' : '0.25x'}</span>
                      </button>
                      
                      <span className="text-[10px] font-mono text-gray-300 w-16 text-right">
                        {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
                      </span>
                    </div>
                  </div>
                </div>

                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex items-center justify-between pointer-events-none z-40">
                  <button disabled={selectedClipIndex === 0} onClick={(e) => { e.stopPropagation(); setSelectedClipIndex(selectedClipIndex - 1); }} className={`p-4 bg-black/50 rounded-full text-white pointer-events-auto backdrop-blur-md transition-all active:scale-90 ${selectedClipIndex === 0 ? 'opacity-0 invisible' : 'opacity-100 visible'}`}><ChevronLeft className="w-8 h-8" /></button>
                  <button disabled={selectedClipIndex === clips.length - 1} onClick={(e) => { e.stopPropagation(); setSelectedClipIndex(selectedClipIndex + 1); }} className={`p-4 bg-black/50 rounded-full text-white pointer-events-auto backdrop-blur-md transition-all active:scale-90 ${selectedClipIndex === clips.length - 1 ? 'opacity-0 invisible' : 'opacity-100 visible'}`}><ChevronRight className="w-8 h-8" /></button>
                </div>
              </div>

              {/* Header Overlay */}
              <div className="p-6 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent absolute top-0 inset-x-0 z-50 pointer-events-none">
                <div className="flex flex-col text-white pointer-events-auto">
                  <h2 className="text-lg font-bold">Swing {selectedClipIndex + 1} of {clips.length}</h2>
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => setDrawMode(drawMode === 'line' ? 'circle' : 'line')} className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${drawMode === 'circle' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                      {drawMode === 'line' ? <MoveRight className="w-3 h-3" /> : <CircleIcon className="w-3 h-3" />} 
                      Mode: {drawMode}
                    </button>
                    <button onClick={clearCanvas} className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-800 text-gray-400 hover:text-white transition-colors"><Eraser className="w-3 h-3" /> Clear Lines</button>
                    <button onClick={() => setShowNotes(!showNotes)} className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${showNotes ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}><FileText className="w-3 h-3" /> Notes {showNotes ? 'ON' : 'OFF'}</button>
                  </div>
                </div>
                <div className="flex items-center gap-3 pointer-events-auto">
                  <button onClick={(e) => { e.stopPropagation(); shareClip(clips[selectedClipIndex!], selectedClipIndex!); }} className="p-3 bg-green-600 rounded-full text-white shadow-lg active:scale-90 transition-transform"><Share2 className="w-5 h-5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); downloadClip(clips[selectedClipIndex!], selectedClipIndex!); }} className="p-3 bg-blue-600 rounded-full text-white shadow-lg active:scale-90 transition-transform"><Download className="w-5 h-5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setSelectedClipIndex(null); }} className="p-3 bg-gray-800 rounded-full text-white shadow-lg active:scale-90 transition-transform"><X className="w-5 h-5" /></button>
                </div>
              </div>

              {/* Notes Overlay */}
              {showNotes && (
                <div className="absolute inset-x-0 bottom-32 px-6 z-50 animate-in slide-in-from-bottom duration-300">
                  <div className="max-w-xl mx-auto bg-gray-900/90 backdrop-blur-md rounded-2xl p-4 border border-white/10 shadow-2xl">
                    <div className="flex items-center gap-2 mb-3 text-blue-400">
                      <FileText className="w-5 h-5" />
                      <h3 className="font-bold text-sm uppercase tracking-wider">Swing Notes</h3>
                    </div>
                    <textarea 
                      value={shotNotes[selectedClipIndex]} 
                      onChange={(e) => updateShotNote(selectedClipIndex, e.target.value)} 
                      placeholder="Record feedback for this swing..." 
                      className="w-full bg-black/40 border border-gray-700 rounded-xl p-4 text-gray-200 placeholder:text-gray-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all min-h-[120px]" 
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
