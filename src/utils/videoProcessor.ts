import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export async function initFFmpeg(onProgress: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  
  onProgress('Initializing video engine...');
  ffmpeg = new FFmpeg();
  
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

  try {
    onProgress('Fetching video core from CDN...');
    
    // Using toBlobURL is the most reliable way to load FFmpeg on production hosts
    // It bypasses many path and MIME-type issues by creating a local blob reference
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
    });
    
    onProgress('Engine ready.');
  } catch (err) {
    console.error("FFmpeg Load Error:", err);
    onProgress(`Error loading engine. Please check your internet connection and security settings.`);
    throw err;
  }
  
  return ffmpeg;
}

export async function processSwings(
  videoBlob: Blob, 
  impacts: number[], 
  onProgress: (progress: string) => void
): Promise<string[]> {
  const fm = await initFFmpeg(onProgress);
  
  const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const inputFileName = `input.${ext}`;
  
  onProgress('Reading recorded session...');
  await fm.writeFile(inputFileName, await fetchFile(videoBlob));
  
  const clipUrls: string[] = [];
  
  for (let i = 0; i < impacts.length; i++) {
    const impactTime = impacts[i];
    const startTime = Math.max(0, impactTime - 2); 
    const duration = 4; 
    
    const outputFileName = `swing_${i}.${ext}`;
    
    onProgress(`Slicing swing ${i + 1} of ${impacts.length}...`);
    
    try {
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
      
      await fm.deleteFile(outputFileName);
    } catch (err) {
      console.error(`Error processing swing ${i}:`, err);
      onProgress(`Error on swing ${i + 1}. Continuing...`);
    }
  }
  
  onProgress('Finalizing gallery...');
  await fm.deleteFile(inputFileName);
  return clipUrls;
}
