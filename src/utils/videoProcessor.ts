import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export async function initFFmpeg(onProgress: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  
  onProgress('Initializing video engine...');
  ffmpeg = new FFmpeg();
  
  try {
    onProgress('Loading local video core (30MB)...');
    await ffmpeg.load({
      coreURL: '/ffmpeg/ffmpeg-core.js',
      wasmURL: '/ffmpeg/ffmpeg-core.wasm',
      workerURL: '/ffmpeg/ffmpeg-core.worker.js',
    });
    onProgress('Engine ready.');
  } catch (err) {
    console.error("FFmpeg Load Error:", err);
    onProgress(`Error: ${err instanceof Error ? err.message : String(err)}. Check security headers.`);
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
      await fm.exec(['-ss', startTime.toString(), '-i', inputFileName, '-t', duration.toString(), '-c', 'copy', '-map', '0', outputFileName]);
      const data = await fm.readFile(outputFileName);
      const safeData = new Uint8Array(data as any);
      const clipBlob = new Blob([safeData], { type: videoBlob.type });
      clipUrls.push(URL.createObjectURL(clipBlob));
      await fm.deleteFile(outputFileName);
    } catch (err) {
      onProgress(`Error on swing ${i + 1}...`);
    }
  }
  
  onProgress('Finalizing gallery...');
  await fm.deleteFile(inputFileName);
  return clipUrls;
}
