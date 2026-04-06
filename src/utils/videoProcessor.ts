import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

// Use local files for 100% offline support
export async function initFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  
  ffmpeg = new FFmpeg();
  
  await ffmpeg.load({
    coreURL: '/ffmpeg/ffmpeg-core.js',
    wasmURL: '/ffmpeg/ffmpeg-core.wasm',
    workerURL: '/ffmpeg/ffmpeg-core.worker.js',
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
  await fm.writeFile(inputFileName, await fetchFile(videoBlob));
  
  const clipUrls: string[] = [];
  
  for (let i = 0; i < impacts.length; i++) {
    const impactTime = impacts[i];
    const startTime = Math.max(0, impactTime - 2); 
    const duration = 4; 
    
    const outputFileName = `swing_${i}.${ext}`;
    
    onProgress(`Extracting swing ${i + 1} of ${impacts.length}...`);
    
    // Placing -ss BEFORE -i is faster and more reliable
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
  
  await fm.deleteFile(inputFileName);
  return clipUrls;
}
