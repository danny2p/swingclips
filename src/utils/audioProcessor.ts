export async function detectImpacts(videoBlob: Blob, sensitivity: number = 100): Promise<number[]> {
  // Use standard AudioContext with fallback for older WebKit
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass();
  
  const arrayBuffer = await videoBlob.arrayBuffer();
  // Decode the entire audio track
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  const channelData = audioBuffer.getChannelData(0); // Use the first channel
  const sampleRate = audioBuffer.sampleRate;

  // 1. Apply High-Pass Filter (Simple IIR at ~1kHz)
  // This removes low-end rumble (wind, traffic) that obscures sharp impacts.
  const rc = 1.0 / (2 * Math.PI * 1000); // 1000Hz cutoff
  const dt = 1.0 / sampleRate;
  const alpha = rc / (rc + dt);
  const filteredData = new Float32Array(channelData.length);
  let prevRaw = 0;
  let prevFiltered = 0;

  for (let i = 0; i < channelData.length; i++) {
    filteredData[i] = alpha * (prevFiltered + channelData[i] - prevRaw);
    prevRaw = channelData[i];
    prevFiltered = filteredData[i];
  }

  const impacts: number[] = [];
  const minTimeBetweenImpacts = 3.0; 
  const startDelay = 0.5; // Ignore impacts for the first 500ms to avoid mic pops

  // Use a 15ms window for fine-grained transient detection
  const windowSize = Math.floor(sampleRate * 0.015); 

  const energyValues: number[] = [];
  let maxEnergy = 0;

  // Calculate rectified sum (energy) for each window using FILTERED data
  for (let i = 0; i < filteredData.length; i += windowSize) {
    let sum = 0;
    for (let j = 0; j < windowSize && (i + j) < filteredData.length; j++) {
      sum += Math.abs(filteredData[i + j]); 
    }
    energyValues.push(sum);
    if (sum > maxEnergy) maxEnergy = sum;
  }

  // 2. Adaptive Thresholding
  // Map sensitivity (0-100) to a threshold.
  // Instead of just maxEnergy * multiplier, we also check if it's a "local spike"
  const normalizedSens = Math.max(0, Math.min(100, sensitivity)) / 100;
  const baseThreshold = maxEnergy * (0.8 - (normalizedSens * 0.75)); // Range: 0.8 down to 0.05

  for (let i = 2; i < energyValues.length; i++) {
    const timeInSeconds = (i * windowSize) / sampleRate;
    const currentEnergy = energyValues[i];

    // Check if current window is significantly louder than the preceding background noise (local spike)
    const localBackground = (energyValues[i-1] + energyValues[i-2]) / 2;
    const isLocalSpike = currentEnergy > (localBackground * 2.5); // At least 2.5x jump

    if (timeInSeconds > startDelay && currentEnergy > baseThreshold && isLocalSpike) {
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
