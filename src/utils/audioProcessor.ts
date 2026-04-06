export async function detectImpacts(videoBlob: Blob): Promise<number[]> {
  // Use standard AudioContext with fallback for older WebKit
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass();
  
  const arrayBuffer = await videoBlob.arrayBuffer();
  // Decode the entire audio track
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  const channelData = audioBuffer.getChannelData(0); // Use the first channel
  const sampleRate = audioBuffer.sampleRate;
  
  const impacts: number[] = [];
  const minTimeBetweenImpacts = 4.0; 
  const startDelay = 0.5; // Ignore impacts for the first 500ms to avoid mic pops
  
  // Use a 20ms window for fine-grained transient detection
  const windowSize = Math.floor(sampleRate * 0.02); 
  
  let maxEnergy = 0;
  const energyValues: number[] = [];
  
  // Calculate rectified sum (energy) for each window
  for (let i = 0; i < channelData.length; i += windowSize) {
    let sum = 0;
    for (let j = 0; j < windowSize && (i + j) < channelData.length; j++) {
      sum += Math.abs(channelData[i + j]); 
    }
    energyValues.push(sum);
    if (sum > maxEnergy) maxEnergy = sum;
  }
  
  // Set threshold to 60% of the maximum recorded volume.
  const threshold = maxEnergy * 0.6; 
  
  for (let i = 0; i < energyValues.length; i++) {
    const timeInSeconds = (i * windowSize) / sampleRate;
    
    // Ignore early impacts and ensure we match the threshold
    if (timeInSeconds > startDelay && energyValues[i] > threshold) {
      // Ensure we don't count the same swing multiple times
      if (impacts.length === 0 || timeInSeconds - impacts[impacts.length - 1] > minTimeBetweenImpacts) {
        impacts.push(timeInSeconds);
      }
    }
  }
  
  if (audioContext.state !== 'closed') {
    await audioContext.close();
  }
  
  return impacts;
}
