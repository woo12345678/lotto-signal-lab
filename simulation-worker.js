importScripts('analysis.js');

self.onmessage = async event => {
  const { draws, iterations } = event.data;
  try {
    const report = await self.LottoEngine.runSimulation(draws, iterations, {
      chunkSize: iterations >= 500000 ? 5000 : 2500,
      candidateLimit: 18000,
      retainedCandidates: 4000,
      onProgress: progress => self.postMessage({ type: 'progress', progress })
    });
    self.postMessage({ type: 'complete', report });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
