/* Makes the share video frame by frame instead of filming the screen.
   Before, MediaRecorder filmed the canvas in real time: the encoder needed a moment to wake up, so the first
   second (the number counting up from zero) was missing, and a busy computer dropped frames, so the video lagged.
   Here every frame is drawn at its exact time (frame i = i/30 s) and handed to the browser's H.264 encoder
   (WebCodecs), then packed into an MP4 with mp4-muxer (MIT, /vendor/mp4-muxer.js). Sharp settings that survive
   WhatsApp and Instagram re-compression: 1080 wide, High profile, 14 Mbps, a key frame every second.
   Browsers without WebCodecs (old Safari, old Firefox) get null and the card falls back to the old recorder. */
(function () {
  'use strict';
  const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.640032'];   // High 4.0, Main 4.0, Baseline 4.0, High 5.0
  let muxP = null;
  function loadMuxer() {
    if (window.Mp4Muxer) return Promise.resolve(window.Mp4Muxer);
    if (!muxP) muxP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = '/vendor/mp4-muxer.js';
      s.onload = () => (window.Mp4Muxer ? res(window.Mp4Muxer) : rej(new Error('no muxer')));
      s.onerror = () => { muxP = null; rej(new Error('no muxer')); };
      document.head.appendChild(s);
    });
    return muxP;
  }
  async function pickCodec(width, height, fps, bitrate) {
    if (!window.VideoEncoder || !window.VideoFrame) return null;
    for (const codec of CODECS) {
      const cfg = { codec, width, height, bitrate, framerate: fps, latencyMode: 'quality', avc: { format: 'avc' } };
      try { const r = await VideoEncoder.isConfigSupported(cfg); if (r && r.supported) return cfg; } catch (e) { /* try the next one */ }
    }
    return null;
  }
  const idle = () => new Promise((r) => setTimeout(r, 0));

  /* opts: { canvas, seconds, fps = 30, draw(t) -> sync or Promise, onProgress(p) }
     returns { blob, ext: 'mp4' } or null when this browser cannot do it */
  async function render(opts) {
    const { canvas } = opts, fps = opts.fps || 30;
    const width = canvas.width, height = canvas.height;
    if (width % 2 || height % 2) return null;
    const bitrate = Math.round(14e6 * (width * height) / (1080 * 1920));
    const cfg = await pickCodec(width, height, fps, bitrate);
    if (!cfg) return null;
    let M;
    try { M = await loadMuxer(); } catch (e) { return null; }
    const muxer = new M.Muxer({ target: new M.ArrayBufferTarget(), video: { codec: 'avc', width, height, frameRate: fps }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
    let failed = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e; } });
    enc.configure(cfg);
    const n = Math.round(opts.seconds * fps), dur = 1e6 / fps;
    for (let i = 0; i < n; i++) {
      if (failed) break;
      await opts.draw(i / fps);
      const f = new VideoFrame(canvas, { timestamp: Math.round(i * dur), duration: Math.round(dur) });
      enc.encode(f, { keyFrame: i % fps === 0 });
      f.close();
      if (opts.onProgress && i % 5 === 0) opts.onProgress(i / n);
      while (enc.encodeQueueSize > 8 && !failed) await new Promise((r) => setTimeout(r, 4));
      if (i % 10 === 9) await idle();   // let the page breathe (progress text, buttons)
    }
    if (failed) { try { enc.close(); } catch (e) {} return null; }
    await enc.flush(); enc.close();
    muxer.finalize();
    if (opts.onProgress) opts.onProgress(1);
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4' };
  }

  /* a video background must show the right frame for time t: seek it and wait */
  function seek(v, t) {
    if (!v || v.tagName !== 'VIDEO' || !v.duration) return Promise.resolve();
    const to = (t % v.duration);
    if (Math.abs(v.currentTime - to) < 0.002) return Promise.resolve();
    return new Promise((res) => {
      const done = () => { v.removeEventListener('seeked', done); clearTimeout(k); res(); };
      const k = setTimeout(done, 500);
      v.addEventListener('seeked', done); v.currentTime = to;
    });
  }

  window.VideoOut = { render, seek, supported: () => !!(window.VideoEncoder && window.VideoFrame) };
})();
