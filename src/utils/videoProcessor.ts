import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

// How many seconds before impact the clip starts.
export const PRE_IMPACT_SECONDS: number =
  parseFloat(process.env.NEXT_PUBLIC_PRE_IMPACT_SECONDS ?? '2');

// How many seconds after impact the clip ends.
export const POST_IMPACT_SECONDS: number =
  parseFloat(process.env.NEXT_PUBLIC_POST_IMPACT_SECONDS ?? '2');

// Total clip duration derived from the above two.
export const CLIP_DURATION = PRE_IMPACT_SECONDS + POST_IMPACT_SECONDS;

// Thumbnail still frame offset from clip start.
// Defaults to PRE_IMPACT_SECONDS (i.e. at impact).
// Set NEXT_PUBLIC_THUMBNAIL_OFFSET to shift it:
//   PRE_IMPACT_SECONDS - 0.5 = half a second before impact
//   PRE_IMPACT_SECONDS + 0.5 = half a second after impact
export const THUMBNAIL_OFFSET: number =
  parseFloat(process.env.NEXT_PUBLIC_THUMBNAIL_OFFSET ?? String(PRE_IMPACT_SECONDS));

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

// In-app debug log — captured so the user can copy/share without DevTools.
const _debugEntries: string[] = [];
function scLog(msg: string) {
  const entry = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  console.log(`[SC] ${msg}`);
  _debugEntries.push(entry);
  if (_debugEntries.length > 300) _debugEntries.shift();
}
function scError(msg: string, err?: unknown) {
  const detail = err instanceof Error ? `${err.message}${err.stack ? '\n' + err.stack : ''}` : String(err ?? '');
  const full = detail ? `${msg}: ${detail}` : msg;
  console.error(`[SC] ${full}`);
  _debugEntries.push(`ERROR ${new Date().toISOString().slice(11, 23)} ${full}`);
}
export function getDebugLog(): string { return _debugEntries.join('\n'); }
export function clearDebugLog(): void { _debugEntries.length = 0; }

export async function resetFFmpeg() {
  if (ffmpeg) {
    scLog('resetFFmpeg: terminating existing instance');
    try {
      ffmpeg.terminate();
    } catch (e) {
      scError('resetFFmpeg: terminate threw', e);
    }
    ffmpeg = null;
    loadPromise = null;

    // Crucial for mobile stability: give the browser a moment
    // to actually kill the worker and free the memory handles.
    await new Promise(resolve => setTimeout(resolve, 300));
    scLog('resetFFmpeg: done');
  } else {
    scLog('resetFFmpeg: no-op (ffmpeg already null)');
  }
}

export async function initFFmpeg(onProgress: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && (ffmpeg as any).isLoaded) { scLog('initFFmpeg: reusing loaded instance'); return ffmpeg; }
  if (loadPromise) { scLog('initFFmpeg: joining in-progress load'); return loadPromise; }

  loadPromise = (async () => {
    onProgress('Loading video engine...');
    const fm = new FFmpeg();

    try {
      const baseURL = window.location.origin + '/ffmpeg';
      scLog('initFFmpeg: loading ST build...');
      await fm.load({
        coreURL: `${baseURL}/ffmpeg-core.js`,
        wasmURL: `${baseURL}/ffmpeg-core.wasm`,
      });
      (fm as any).isLoaded = true;
      scLog('initFFmpeg: load complete');
      onProgress('Engine ready.');
      ffmpeg = fm;
      return fm;
    } catch (err) {
      loadPromise = null;
      scError('initFFmpeg: load failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      onProgress(`Error loading video engine: ${msg}`);
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
  scLog(`processSwings start — ${impacts.length} clips, blob ${(videoBlob.size / 1024 / 1024).toFixed(1)}MB, ffmpegLoaded=${!!(ffmpeg && (ffmpeg as any).isLoaded)}`);
  // Reset any existing instance to free the WASM heap from the previous session
  // before loading this session's video blob. Prevents intermittent OOM failures
  // on memory-constrained Android devices.
  await resetFFmpeg();
  scLog('FFmpeg reset complete, loading engine...');
  const fm = await initFFmpeg(onProgress);
  scLog('FFmpeg engine ready');

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
  const fileSize = fileData.length;
  await fm.writeFile(inputFileName, fileData);
  scLog(`writeFile complete: ${inputFileName} (${fileSize} bytes)`);
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
      scError('Fast-start optimization failed, falling back to raw input', err);
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
      try {
        await resetFFmpeg();
        activeFm = await initFFmpeg(onProgress);

        // Re-write the input file to the new engine's filesystem.
        // This is the most memory-intensive step on long sessions — if it fails
        // (e.g. Android out-of-WASM-heap), fall back to the previous engine
        // rather than crashing the entire loop.
        let fileData: Uint8Array | null = await fetchFile(videoBlob);
        await activeFm.writeFile(inputFileName, fileData);
        fileData = null;

        if (isIOS) {
          await activeFm.exec(['-i', inputFileName, '-c', 'copy', '-movflags', '+faststart', optimizedFileName]);
          await activeFm.deleteFile(inputFileName);
        }
      } catch (resetErr) {
        scError(`Fresh engine reset failed at clip ${i + 1}, continuing with existing engine`, resetErr);
        // Re-initialise activeFm from the singleton in case it was partially torn down
        activeFm = await initFFmpeg(onProgress);
      }
    }

    const fm = activeFm;
    const impactTime = impacts[i];
    const startTime = Math.max(0, impactTime - PRE_IMPACT_SECONDS);
    const duration = CLIP_DURATION;
    const outputFileName = `swing_${i}.mp4`;
    const thumbFileName = `thumb_${i}.jpg`;
    onProgress(`Slicing swing ${i + 1} of ${impacts.length}...`);
    scLog(`Clip ${i + 1}: start=${startTime.toFixed(2)}s input=${activeInputFile}`);
    try {
      await fm.exec([
        '-ss', startTime.toString(),
        '-i', activeInputFile,
        '-t', duration.toString(),
        '-c', 'copy',
        outputFileName
      ]);
      scLog(`Clip ${i + 1}: clip exec done, reading file...`);

      const data = await fm.readFile(outputFileName);
      scLog(`Clip ${i + 1}: clip readFile done (${(data as any).length} bytes)`);
      const clipBlob = new Blob([new Uint8Array(data as any)], { type: 'video/mp4' });
      const url = URL.createObjectURL(clipBlob);

      await fm.exec([
        '-ss', (startTime + THUMBNAIL_OFFSET).toString(),
        '-i', activeInputFile,
        '-vframes', '1',
        '-q:v', '4',
        '-update', '1',
        '-f', 'image2',
        thumbFileName
      ]);
      scLog(`Clip ${i + 1}: thumb exec done, reading file...`);

      const thumbData = await fm.readFile(thumbFileName);
      scLog(`Clip ${i + 1}: thumb readFile done (${(thumbData as any).length} bytes)`);
      const thumbnail = new Uint8Array(thumbData as any);

      scLog(`Clip ${i + 1} ready, size=${clipBlob.size}`);
      if (onClipReady) await onClipReady(i, url, clipBlob, thumbnail);

      await fm.deleteFile(outputFileName);
      await fm.deleteFile(thumbFileName);
    } catch (err) {
      scError(`Clip ${i + 1} FAILED`, err);
      onProgress(`Error on swing ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
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

// Extracts a single still frame from a clip blob at THUMBNAIL_OFFSET seconds
// and returns it as a Base64 data URL. Used for background thumbnail migration
// when NEXT_PUBLIC_THUMBNAIL_OFFSET changes between deploys.
export async function extractThumbnail(clipBlob: Blob): Promise<string> {
  const fm = await initFFmpeg(() => {});
  const inputFile = 'thumb_input.mp4';
  const outputFile = 'thumb_output.jpg';

  const arrayBuffer = await clipBlob.arrayBuffer();
  await fm.writeFile(inputFile, new Uint8Array(arrayBuffer));

  await fm.exec([
    '-ss', THUMBNAIL_OFFSET.toString(),
    '-i', inputFile,
    '-vframes', '1',
    '-q:v', '4',
    '-f', 'image2',
    outputFile,
  ]);

  const data = await fm.readFile(outputFile);
  const binary = Array.from(new Uint8Array(data as any))
    .map(b => String.fromCharCode(b))
    .join('');
  const base64 = `data:image/jpeg;base64,${window.btoa(binary)}`;

  await fm.deleteFile(inputFile);
  await fm.deleteFile(outputFile);

  return base64;
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
