import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export async function initFFmpeg(onProgress: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
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
  onClipReady?: (index: number, clipUrl: string, clipBlob: Blob) => void
): Promise<{url: string, blob: Blob}[]> {
  const fm = await initFFmpeg(onProgress);
  
  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  const ext = videoBlob.type.includes('mp4') || videoBlob.type.includes('quicktime') ? 'mp4' : 'webm';
  const inputFileName = `input.${ext}`;
  const optimizedFileName = `optimized_${inputFileName}`;
  
  onProgress('Reading recorded session...');
  await fm.writeFile(inputFileName, await fetchFile(videoBlob));

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

  const clipResults: {url: string, blob: Blob}[] = [];
  
  for (let i = 0; i < impacts.length; i++) {
    const impactTime = impacts[i];
    const startTime = Math.max(0, impactTime - 2); 
    const duration = 4; 
    const outputFileName = `swing_${i}.mp4`;
    onProgress(`Slicing swing ${i + 1} of ${impacts.length}...`);
    try {
      // FAST SLICING: No filter_complex, simple high-speed transcode
      await fm.exec([
        '-ss', startTime.toString(), 
        '-i', activeInputFile, 
        '-t', duration.toString(), 
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-g', '5',
        '-threads', '0',
        '-movflags', '+faststart',
        '-c:a', 'aac',
        '-b:a', '128k',
        outputFileName
      ]);
      const data = await fm.readFile(outputFileName);
      const safeData = new Uint8Array(data as any);
      const clipBlob = new Blob([safeData], { type: 'video/mp4' });
      const url = URL.createObjectURL(clipBlob);
      
      clipResults.push({url, blob: clipBlob});
      if (onClipReady) onClipReady(i, url, clipBlob);
      
      await fm.deleteFile(outputFileName);
    } catch (err) {
      onProgress(`Error on swing ${i + 1}...`);
    }
  }
  
  onProgress('Finalizing gallery...');
  await fm.deleteFile(activeInputFile);
  return clipResults;
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
