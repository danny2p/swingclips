"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Square, Loader2, RotateCcw, Download, Archive, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { detectImpacts } from '@/utils/audioProcessor';
import { processSwings } from '@/utils/videoProcessor';
import JSZip from 'jszip';

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
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);

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
    const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm;codecs=vp8,opus';
    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    
    mediaRecorderRef.current = mediaRecorder;
    
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    
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
        setAppState('gallery');
      } catch (err) {
        console.error("Processing error:", err);
        alert("Error processing video.");
        setAppState('camera');
      }
    };
    
    // Add small delay to let stream warm up
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
      setAppState('camera');
    }
  };

  const downloadClip = (url: string, index: number) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `swing_${index + 1}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAllAsZip = async () => {
    setProgressText("Creating ZIP archive...");
    const zip = new JSZip();
    
    for (let i = 0; i < clips.length; i++) {
      const response = await fetch(clips[i]);
      const blob = await response.blob();
      zip.file(`swing_${i + 1}.webm`, blob);
    }
    
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `golf_session_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    setProgressText(`Found ${clips.length} swings. Processing clips...`); // Restore original text
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
          <h2 className="text-2xl font-bold mb-2">Processing</h2>
          <p className="text-gray-400 font-medium">{progressText}</p>
        </div>
      )}

      {appState === 'gallery' && (
        <div className="flex-1 flex flex-col bg-gray-950 z-20 overflow-hidden">
          <div className="p-4 pt-8 flex items-center justify-between border-b border-gray-800 bg-gray-900 shadow-md">
             <div>
               <h1 className="text-lg font-bold">Session Gallery</h1>
               <p className="text-xs text-gray-400">{clips.length} swings captured</p>
             </div>
             <div className="flex gap-2">
               <button 
                 onClick={downloadAllAsZip}
                 className="p-2 px-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
               >
                 <Archive className="w-4 h-4 text-white" />
                 <span className="text-sm font-semibold">ZIP All</span>
               </button>
               <button 
                 onClick={resetApp} 
                 className="p-2 px-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
               >
                 <RotateCcw className="w-4 h-4 text-gray-300" />
                 <span className="text-sm font-semibold text-gray-300">New</span>
               </button>
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 bg-gray-950">
             <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {clips.map((clipUrl, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setSelectedClipIndex(idx)}
                    className="relative group bg-gray-900 rounded-xl overflow-hidden shadow-xl border border-gray-800 cursor-pointer active:scale-95 transition-transform"
                  >
                    <video 
                      src={clipUrl}
                      className="w-full aspect-video object-cover pointer-events-none"
                      muted
                      playsInline
                    />
                    <div className="p-3 flex items-center justify-between">
                       <span className="text-xs font-bold text-gray-400">Swing #{idx + 1}</span>
                       <div className="p-1.5 bg-gray-800 rounded-md text-blue-400">
                         <Download className="w-4 h-4" />
                       </div>
                    </div>
                  </div>
                ))}
             </div>
          </div>

          {/* Fullscreen Modal Viewer */}
          {selectedClipIndex !== null && (
            <div className="fixed inset-0 z-50 bg-black flex flex-col">
              {/* Modal Header */}
              <div className="p-6 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent absolute top-0 inset-x-0 z-50">
                <div className="flex flex-col text-white">
                  <h2 className="text-lg font-bold">Swing {selectedClipIndex + 1} of {clips.length}</h2>
                  <p className="text-xs text-gray-400">Previewing individual clip</p>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadClip(clips[selectedClipIndex!], selectedClipIndex!);
                    }}
                    className="p-3 bg-blue-600 rounded-full text-white shadow-lg active:scale-90 transition-transform"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedClipIndex(null);
                    }}
                    className="p-3 bg-gray-800 rounded-full text-white shadow-lg active:scale-90 transition-transform"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Video Player Container */}
              <div className="flex-1 relative flex items-center justify-center p-4 bg-black">
                <video 
                  key={clips[selectedClipIndex]}
                  src={clips[selectedClipIndex]}
                  autoPlay
                  loop
                  playsInline
                  controls
                  className="max-w-full max-h-full rounded-lg shadow-2xl"
                />
                
                {/* Navigation Arrows */}
                <div className="absolute inset-x-4 flex items-center justify-between pointer-events-none">
                  <button 
                    disabled={selectedClipIndex === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedClipIndex(selectedClipIndex - 1);
                    }}
                    className={`p-4 bg-black/50 rounded-full text-white pointer-events-auto backdrop-blur-md transition-all active:scale-90 ${selectedClipIndex === 0 ? 'opacity-0 invisible' : 'opacity-100 visible'}`}
                  >
                    <ChevronLeft className="w-8 h-8" />
                  </button>
                  <button 
                    disabled={selectedClipIndex === clips.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedClipIndex(selectedClipIndex + 1);
                    }}
                    className={`p-4 bg-black/50 rounded-full text-white pointer-events-auto backdrop-blur-md transition-all active:scale-90 ${selectedClipIndex === clips.length - 1 ? 'opacity-0 invisible' : 'opacity-100 visible'}`}
                  >
                    <ChevronRight className="w-8 h-8" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </main>
  );
}
