"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Square, Loader2, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { detectImpacts } from '@/utils/audioProcessor';
import { processSwings } from '@/utils/videoProcessor';

export default function Home() {
  // App states: 'camera' | 'processing' | 'gallery'
  const [appState, setAppState] = useState<'camera' | 'processing' | 'gallery'>('camera');
  
  // Camera & Recording
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  
  // Processing
  const [progressText, setProgressText] = useState('');
  
  // Gallery
  const [clips, setClips] = useState<string[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);

  // Initialize camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera", err);
      alert("Could not access camera. Please allow camera and microphone permissions.");
    }
  }, []);

  useEffect(() => {
    if (appState === 'camera') {
      startCamera();
    }
    
    // Cleanup
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [appState, startCamera]);

  // Handle Recording
  const startRecording = useCallback(() => {
    if (!videoRef.current?.srcObject) return;
    
    const stream = videoRef.current.srcObject as MediaStream;
    // Attempt to use a common format that works well locally
    const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm;codecs=vp8,opus';
    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    
    mediaRecorderRef.current = mediaRecorder;
    
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    
    mediaRecorder.onstop = async () => {
      const fullVideoBlob = new Blob(chunks, { type: mediaRecorder.mimeType });
      
      // Move to processing state
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
        setCurrentClipIndex(0);
        setAppState('gallery');
      } catch (err) {
        console.error("Processing error:", err);
        alert("Error processing video.");
        setAppState('camera');
      }
    };
    
    mediaRecorder.start(200); // collect 200ms chunks
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const resetApp = () => {
    clips.forEach(url => URL.revokeObjectURL(url));
    setClips([]);
    setAppState('camera');
  };

  // Render Views
  return (
    <main className="fixed inset-0 bg-black text-white flex flex-col font-sans overflow-hidden">
      
      {appState === 'camera' && (
        <>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover absolute inset-0 z-0"
          />
          <div className="absolute inset-x-0 top-0 p-6 z-10 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
             <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-md">SwingClips</h1>
          </div>
          
          <div className="absolute inset-x-0 bottom-0 pb-12 pt-24 bg-gradient-to-t from-black/80 to-transparent z-10 flex flex-col items-center justify-end">
            {isRecording && (
              <div className="mb-6 flex items-center space-x-2 text-red-500 font-bold animate-pulse">
                <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
                <span className="drop-shadow-md">Recording</span>
              </div>
            )}
            
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
                isRecording 
                  ? "bg-red-500 hover:bg-red-600 scale-90" 
                  : "bg-white hover:bg-gray-200"
              }`}
            >
              {isRecording ? (
                <Square className="text-white w-8 h-8 fill-current" />
              ) : (
                <div className="w-16 h-16 rounded-full border-4 border-black/10 bg-red-500 flex items-center justify-center">
                   <Video className="text-white w-8 h-8" />
                </div>
              )}
            </button>
          </div>
        </>
      )}

      {appState === 'processing' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-20 bg-gray-900">
          <Loader2 className="w-16 h-16 animate-spin text-blue-500 mb-6" />
          <h2 className="text-2xl font-bold mb-2">Processing Swings</h2>
          <p className="text-gray-400 font-medium">{progressText}</p>
        </div>
      )}

      {appState === 'gallery' && clips.length > 0 && (
        <div className="flex-1 flex flex-col bg-gray-950 z-20">
          <div className="p-4 pt-8 flex items-center justify-between border-b border-gray-800 bg-gray-900 shadow-md">
             <h1 className="text-lg font-bold">Swing {currentClipIndex + 1} of {clips.length}</h1>
             <button onClick={resetApp} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full transition-colors flex items-center gap-2 pr-4">
               <RotateCcw className="w-5 h-5 text-gray-300" />
               <span className="text-sm font-medium text-gray-300">New Session</span>
             </button>
          </div>
          
          <div className="flex-1 relative flex items-center justify-center bg-black">
             <video 
               key={clips[currentClipIndex]}
               src={clips[currentClipIndex]}
               autoPlay
               loop
               playsInline
               controls
               className="w-full h-full object-contain"
             />
             
             {/* Carousel Controls */}
             <div className="absolute inset-y-0 left-0 flex items-center px-4">
               <button 
                 onClick={() => setCurrentClipIndex(Math.max(0, currentClipIndex - 1))}
                 disabled={currentClipIndex === 0}
                 className="p-3 bg-black/60 hover:bg-black/80 rounded-full text-white disabled:opacity-0 transition-opacity backdrop-blur-sm"
               >
                 <ChevronLeft className="w-8 h-8" />
               </button>
             </div>
             
             <div className="absolute inset-y-0 right-0 flex items-center px-4">
               <button 
                 onClick={() => setCurrentClipIndex(Math.min(clips.length - 1, currentClipIndex + 1))}
                 disabled={currentClipIndex === clips.length - 1}
                 className="p-3 bg-black/60 hover:bg-black/80 rounded-full text-white disabled:opacity-0 transition-opacity backdrop-blur-sm"
               >
                 <ChevronRight className="w-8 h-8" />
               </button>
             </div>
          </div>
        </div>
      )}

    </main>
  );
}
