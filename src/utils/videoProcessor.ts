import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

// Helper to load external resources directly to Blob URL to bypass some CORS restrictions
async function toBlobURL(url: string, mimeType: string): Promise<string> {
  const resp = await fetch(url);
  const blob = await resp.blob();
  const fileBlob = new Blob([blob], { type: mimeType });
  return URL.createObjectURL(fileBlob);
}

export async function initFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  
  ffmpeg = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  
  return ffmpeg;
}

export async function processSwings(
  videoBlob: Blob, 
  impacts: number[], 
  onProgress: (progress: string) => void
): Promise<string[]> {
  const fm = await initFFmpeg();
  
  const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const inputFileName = `input.${ext}`;
  
  onProgress('Loading video engine...');
  // Write the file to ffmpeg virtual file system
  await fm.writeFile(inputFileName, await fetchFile(videoBlob));
  
  const clipUrls: string[] = [];
  
  for (let i = 0; i < impacts.length; i++) {
    const impactTime = impacts[i];
    // Start 2 seconds before impact, but not less than 0
    const startTime = Math.max(0, impactTime - 2); 
    const duration = 4; // Total clip length is 4 seconds
    
    const outputFileName = `swing_${i}.${ext}`;
    
    onProgress(`Extracting swing ${i + 1} of ${impacts.length}...`);
    
    // Placing -ss BEFORE -i is faster and often more reliable for the first clip
    // as it seeks to the nearest keyframe before the timestamp.
    await fm.exec([
      '-ss', startTime.toString(),
      '-i', inputFileName,
      '-t', duration.toString(),
      '-c', 'copy',
      '-map', '0',
      outputFileName
    ]);
    
    const data = await fm.readFile(outputFileName);
    const safeData = new Uint8Array(data as any);
    const clipBlob = new Blob([safeData], { type: videoBlob.type });
    const clipUrl = URL.createObjectURL(clipBlob);
    clipUrls.push(clipUrl);
  }
  
  // Cleanup virtual fs
  await fm.deleteFile(inputFileName);
  
  return clipUrls;
}
