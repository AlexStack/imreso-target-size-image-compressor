/**
 * ImageResizer.cc — main-thread worker client.
 *
 * Spins up the module worker once, exposes a Promise-based compress() over a
 * tiny id/postMessage protocol, plus the shouldCompress()/outName() helpers the
 * plupload interceptor uses. No build-time imports — ships as a plain script and
 * reads its config from the localized global BICR_CFG.
 */
(() => {
  const CFG = window.BICR_CFG || {};
  window.BICR = window.BICR || {};

  // Mobile WebKit: AVIF single-threaded encode is slow and memory-heavy, so we
  // steer the engine to WebP there (still a big win, far more reliable).
  const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');

  let worker = null; // lazily created; null again after a fatal worker error.
  let seq = 0;
  const pending = new Map();
  let queueTail = Promise.resolve(); // serializes jobs → one worker job at a time.

  function makeWorker() {
    const w = new Worker(CFG.workerUrl, { type: 'module' });
    w.onmessage = (e) => {
      const data = e.data || {};
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.error) {
        p.reject(new Error(data.error));
      } else {
        p.resolve({ blob: data.blob, meta: data.meta });
      }
    };
    w.onerror = () => {
      // Reject everything in flight; next compress() rebuilds the worker.
      pending.forEach((p) => {
        p.reject(new Error('worker error'));
      });
      pending.clear();
      worker = null;
    };
    return w;
  }

  /**
   * Compress a File in the worker. Resolves to { blob, meta }. Jobs are run
   * one at a time: a bulk upload hands the worker many files at once, and the
   * single worker (one WASM codec instance, finite memory) must not decode and
   * encode them all concurrently — that's what made bulk uploads hang.
   * @param {File} file
   * @param {{format:string,quality:number,maxDim:number,targetBytes:number}} opts
   * @returns {Promise<{blob:Blob, meta:object}>}
   */
  function compress(file, opts) {
    const run = queueTail.then(() => compressOne(file, opts));
    queueTail = run.then(
      () => {},
      () => {}, // keep the chain alive after a failed job.
    );
    return run;
  }

  function compressOne(file, opts) {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      return Promise.reject(new Error('worker/OffscreenCanvas unsupported'));
    }
    if (!worker) worker = makeWorker();
    const id = ++seq;
    const payload = {
      id,
      file,
      opts: {
        format: opts?.format || 'webp',
        quality: opts?.quality || 72,
        maxDim: opts && typeof opts.maxDim === 'number' ? opts.maxDim : 1920,
        targetBytes: opts && typeof opts.targetBytes === 'number' ? opts.targetBytes : 0,
        noAvif: IS_MOBILE,
      },
    };
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage(payload);
    });
  }

  /**
   * Classify an input file:
   *  - 'recompress' web-native raster (JPEG/PNG/WebP/AVIF): re-encode, but only
   *    keep the result if it's smaller.
   *  - 'convert' non-web / heavy raster (HEIC/HEIF, TIFF, BMP): always replace
   *    with a web format — the goal is conversion, not only shrinkage.
   *  - 'skip' everything we shouldn't touch: animated-capable GIF (re-encoding
   *    would drop frames), SVG (vector), ICO, JP2 (no cross-browser worker
   *    decode), and unknown types → uploaded untouched.
   * Classified by extension first (most reliable), then MIME.
   */
  function classify(file) {
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
    const is = (re, exts) => re.test(type) || exts.includes(ext);

    if (is(/^image\/(heic|heif)/, ['heic', 'heif'])) return 'convert';
    if (is(/^image\/tiff/, ['tif', 'tiff'])) return 'convert';
    if (is(/^image\/bmp/, ['bmp'])) return 'convert';
    if (is(/^image\/(jpeg|png|webp|avif)$/, ['jpg', 'jpeg', 'png', 'webp', 'avif'])) {
      return 'recompress';
    }
    return 'skip';
  }

  /** Non-web/heavy source we always replace with the converted output. */
  function isConvert(file) {
    return classify(file) === 'convert';
  }

  /** Should we intercept this upload? Convert types: any size; recompress: above floor. */
  function shouldCompress(file) {
    const kind = classify(file);
    if (kind === 'convert') return true;
    if (kind === 'recompress') return file.size > (CFG.minBytes || 10240);
    return false;
  }

  /** Output filename: swap the extension to match the produced blob type. */
  function outName(file, blob) {
    const ext = (blob.type.split('/')[1] || 'img').replace('jpeg', 'jpg');
    return `${file.name.replace(/\.\w+$/, '')}.${ext}`;
  }

  /**
   * Persist a per-attachment saving (and bump the aggregate) via admin-ajax, so
   * the size reduction is visible in the Media Library + settings. Fire-and-forget.
   */
  function recordSaving(attachmentId, original, optimized) {
    if (!CFG.ajax || !CFG.ajax.url || !attachmentId || !original || !optimized) return;
    const body = new FormData();
    body.append('action', 'bicr_record');
    body.append('_wpnonce', CFG.ajax.nonce || '');
    body.append('attachment_id', String(attachmentId));
    body.append('original', String(original));
    body.append('optimized', String(optimized));
    fetch(CFG.ajax.url, { method: 'POST', credentials: 'same-origin', body }).catch(() => {});
  }

  window.BICR.worker = { compress };
  window.BICR.shouldCompress = shouldCompress;
  window.BICR.isConvert = isConvert;
  window.BICR.outName = outName;
  window.BICR.recordSaving = recordSaving;
  window.BICR.cfg = CFG;
})();
