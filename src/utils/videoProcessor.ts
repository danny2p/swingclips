import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export async function resetFFmpeg() {
  if (ffmpeg) {
    try {
      ffmpeg.terminate();
    } catch (e) {
      // Ignore termination errors
    }
    ffmpeg = null;
    loadPromise = null;
    
    // Crucial for mobile stability: give the browser a moment 
    // to actually kill the worker and free the memory handles.
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

export async function initFFmpeg(onProgress: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && (ffmpeg as any).isLoaded) return ffmpeg;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    onProgress('Initializing video engine...');
    const fm = new FFmpeg();
    
    try {
      const baseURL = window.location.origin + '/ffmpeg';
      const isIsolated = typeof window !== 'undefined' && window.crossOriginIsolated;
      
      onProgress(isIsolated ? 'Loading video core...' : 'Loading video core (standard mode)...');
      
      const loadOptions: any = {
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      };

      if (isIsolated) {
        loadOptions.workerURL = await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript');
      }

      await fm.load(loadOptions);
      (fm as any).isLoaded = true;
      
      onProgress('Engine ready.');
      ffmpeg = fm;
      return fm;
    } catch (err) {
      loadPromise = null;
      console.error("FFmpeg Load Error:", err);
      const isIsolated = typeof window !== 'undefined' && window.crossOriginIsolated;
      const msg = !isIsolated 
        ? "Security restriction: SharedArrayBuffer is disabled. Ensure site is served over HTTPS and security headers are active."
        : (err instanceof Error ? err.message : String(err));
      onProgress(`Error: ${msg}`);
      throw err;
    }
  })();

  return loadPromise;
}

export async function processSwings(
  videoBlob: Blob, 
  impacts: number[], 
  onProgress: (progress: string) => void,
  onClipReady?: (index: number, clipUrl: string, clipBlob: Blob, thumbnail?: Uint8Array) => void
): Promise<{url: string, blob: Blob, thumbnail?: Uint8Array}[]> {
  const fm = await initFFmpeg(onProgress);
  
  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  const ext = videoBlob.type.includes('mp4') || videoBlob.type.includes('quicktime') ? 'mp4' : 'webm';
  const inputFileName = `input.${ext}`;
  const optimizedFileName = `optimized_${inputFileName}`;
  
  onProgress('Reading recorded session...');
  
  // LOW MEMORY OPTIMIZATION:
  // Instead of using fetchFile(videoBlob) which creates a temporary Uint8Array 
  // that persists until GC, we manually handle the ArrayBuffer and null it out.
  let fileData: Uint8Array | null = await fetchFile(videoBlob);
  await fm.writeFile(inputFileName, fileData);
  fileData = null; // Explicitly free memory reference

  let activeInputFile = inputFileName;

  if (isIOS) {
    onProgress('Optimizing video for mobile slicing...');
    try {
      await fm.exec([
        '-i', inputFileName,
        '-c', 'copy',
        '-movflags', '+faststart',
        optimizedFileName
      ]);
      await fm.deleteFile(inputFileName);
      activeInputFile = optimizedFileName;
    } catch (err) {
      console.warn("Fast-start optimization failed, falling back to raw input:", err);
      activeInputFile = inputFileName;
    }
  }

  let activeFm = await initFFmpeg(onProgress);

  // Process one by one and release memory immediately via onClipReady
  for (let i = 0; i < impacts.length; i++) {
    // FRESH ENGINE STRATEGY:
    // Every 10 clips, completely reset FFmpeg to flush WASM memory.
    if (i > 0 && i % 10 === 0) {
      onProgress(`Refreshing video engine (clip ${i + 1})...`);
      await resetFFmpeg();
      activeFm = await initFFmpeg(onProgress);
      
      // Re-write the input file to the new engine's filesystem
      let fileData: Uint8Array | null = await fetchFile(videoBlob);
      await activeFm.writeFile(inputFileName, fileData);
      fileData = null;

      if (isIOS) {
        // Must re-run the faststart fix for the new engine
        await activeFm.exec(['-i', inputFileName, '-c', 'copy', '-movflags', '+faststart', optimizedFileName]);
        await activeFm.deleteFile(inputFileName);
      }
    }

    const fm = activeFm;
    const impactTime = impacts[i];
    const startTime = Math.max(0, impactTime - 2); 
    const duration = 4; 
    const outputFileName = `swing_${i}.mp4`;
    const thumbFileName = `thumb_${i}.jpg`;
    onProgress(`Slicing swing ${i + 1} of ${impacts.length}...`);
    try {
      if (isIOS) {
        // iOS: FAST COPY PASS + FAST THUMBNAIL
        await fm.exec([
          '-ss', startTime.toString(), 
          '-i', activeInputFile, 
          '-t', duration.toString(),
          '-c', 'copy',
          outputFileName
        ]);

        const data = await fm.readFile(outputFileName);
        const clipBlob = new Blob([new Uint8Array(data as any)], { type: 'video/mp4' });
        const url = URL.createObjectURL(clipBlob);

        await fm.exec([
          '-ss', (startTime + 2).toString(),
          '-i', activeInputFile,
          '-vframes', '1',
          '-q:v', '4',
          '-f', 'image2',
          thumbFileName
        ]);

        const thumbData = await fm.readFile(thumbFileName);
        const thumbnail = new Uint8Array(thumbData as any);
        
        if (onClipReady) onClipReady(i, url, clipBlob, thumbnail);
        
        await fm.deleteFile(outputFileName);
        await fm.deleteFile(thumbFileName);
      } else {
        // Android/Desktop: SUPER FAST SINGLE PASS + FAST THUMBNAIL
        await fm.exec([
          '-ss', startTime.toString(), 
          '-i', activeInputFile, 
          '-t', duration.toString(), 
          '-c', 'copy',
          outputFileName
        ]);

        const data = await fm.readFile(outputFileName);
        const clipBlob = new Blob([new Uint8Array(data as any)], { type: 'video/mp4' });
        const url = URL.createObjectURL(clipBlob);

        await fm.exec([
          '-ss', (startTime + 2).toString(),
          '-i', activeInputFile,
          '-vframes', '1',
          '-q:v', '4',
          '-f', 'image2',
          thumbFileName
        ]);

        const thumbData = await fm.readFile(thumbFileName);
        const thumbnail = new Uint8Array(thumbData as any);

        if (onClipReady) onClipReady(i, url, clipBlob, thumbnail);
        
        await fm.deleteFile(outputFileName);
        await fm.deleteFile(thumbFileName);
      }
    } catch (err) {
      onProgress(`Error on swing ${i + 1}...`);
    }
  }
  
  onProgress('Finalizing gallery...');
  try {
    await activeFm.deleteFile(activeInputFile);
  } catch (e) {
    // Ignore cleanup errors at the very end
  }
  return [];
}

export async function burnLinesToVideo(
  videoBlob: Blob,
  imageBlob: Blob,
  onProgress: (progress: string) => void
): Promise<string> {
  const fm = await initFFmpeg(onProgress);
  const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const inputFileName = `input_burn.${ext}`;
  const overlayFileName = `overlay.png`;
  const outputFileName = `output_burn.mp4`;

  onProgress('Preparing video for burn-in...');
  await fm.writeFile(inputFileName, await fetchFile(videoBlob));
  await fm.writeFile(overlayFileName, await fetchFile(imageBlob));

  onProgress('Burning lines into video (this takes a few seconds)...');
  try {
    await fm.exec([
      '-i', inputFileName,
      '-i', overlayFileName,
      '-filter_complex', '[0:v][1:v]overlay=0:0',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-threads', '0',
      '-c:a', 'copy',
      outputFileName
    ]);
    const data = await fm.readFile(outputFileName);
    const safeData = new Uint8Array(data as any);
    const clipBlob = new Blob([safeData], { type: 'video/mp4' });
    
    await fm.deleteFile(inputFileName);
    await fm.deleteFile(overlayFileName);
    await fm.deleteFile(outputFileName);
    
    return URL.createObjectURL(clipBlob);
  } catch (err) {
    console.error("Burn-in error:", err);
    throw err;
  }
}
