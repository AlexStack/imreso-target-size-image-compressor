/**
 * ImageResizer.cc — classic uploader (plupload) interceptor.
 *
 * Hooks EVERY WordPress plupload instance (Media Library, classic "Add Media"
 * modal, media-new.php, and the Media Library modal in the block editor) and
 * runs new image files through the in-browser engine before upload.
 *
 * Why priority 999 + splice: WordPress's own FilesAdded handler (wp-plupload.js)
 * creates the "uploading" tile AND calls up.start() for every file. We must run
 * BEFORE it (moxie sorts handlers by priority desc) and remove our images from
 * both plupload's queue (removeFile) and the event's files array (splice) — the
 * latter is a throwaway array, not the internal queue — so WordPress never makes
 * a stuck tile for the un-compressed original. We then add the compressed file
 * back, which fires a fresh, clean tile that uploads and completes normally.
 * Every failure path re-adds the original, so an upload is never blocked.
 *
 * Why we wrap the CONSTRUCTOR, not plupload.Uploader.prototype.init: plupload
 * 2.x assigns init/bind/addFile/removeFile as *own* properties on each instance
 * inside the Uploader constructor, so those instance methods shadow the
 * prototype — patching prototype.init is a silent no-op that never runs and
 * leaves uploads uncompressed. Wrapping the constructor is the one chokepoint
 * every WordPress uploader flows through (the wp.Uploader-wrapped media modal
 * and Media Library grid, the raw plupload uploader on media-new.php, and the
 * Media Library list view all do `new plupload.Uploader(...)`), so binding on
 * the freshly built instance covers them all. Binding before the caller's own
 * init() is fine: plupload keeps listeners added pre-init.
 */
(() => {
  if (!window.plupload || !plupload.Uploader || !window.BICR || !BICR.worker) return;
  if (plupload.Uploader.__bicrWrapped) return; // never double-wrap.

  const processed = new WeakSet(); // native Files we've handled or produced.
  const saved = new WeakMap(); // compressed File -> { original, optimized } bytes.

  // Wrap the base Uploader constructor so EVERY WordPress uploader is covered in
  // one place. Each new instance gets our handlers bound directly on it (the
  // instance's own bind), before the caller inits or adds files.
  const OrigUploader = plupload.Uploader;
  function BicrUploader(settings) {
    const inst = new OrigUploader(settings);
    // bind(name, callback, scope, priority) — 999 runs before WordPress's handler.
    try {
      inst.bind('FilesAdded', onFilesAdded, null, 999);
      inst.bind('FileUploaded', onFileUploaded); // record savings once we have an id.
    } catch (e) {
      /* never let our hook break the uploader */
    }
    return inst; // returning the real instance keeps `new`/instanceof intact.
  }
  // Share the prototype so `x instanceof plupload.Uploader` still holds, and copy
  // any static members callers might read off the constructor.
  BicrUploader.prototype = OrigUploader.prototype;
  for (const k of Object.keys(OrigUploader)) {
    try {
      BicrUploader[k] = OrigUploader[k];
    } catch (e) {
      /* skip non-writable statics */
    }
  }
  BicrUploader.__bicrWrapped = true;
  plupload.Uploader = BicrUploader;

  /** Match the uploaded file to the savings we recorded for it, then persist. */
  function onFileUploaded(up, file, response) {
    try {
      const native = file.getNative ? file.getNative() : null;
      const s = native && saved.get(native);
      if (!s) return;
      const id = attachmentId(response.response);
      if (id) BICR.recordSaving(id, s.original, s.optimized);
    } catch {
      /* ignore — recording is best-effort */
    }
  }

  /**
   * async-upload.php answers in two shapes depending on the screen. The Media
   * Library grid and the "Add Media" modal go through wp.Uploader and get
   * `{ success: true, data: { id, … } }`; the Add New Media screen
   * (media-new.php) posts the classic form and gets the bare attachment id
   * back, e.g. `18`. Reading only the first shape used to drop the savings for
   * every upload made on that screen — the file was still compressed, but the
   * dashboard and the "Optimized" column never learned about it.
   */
  function attachmentId(body) {
    const parsed = JSON.parse(body);
    if (typeof parsed === 'number') return parsed;
    if (parsed && parsed.data && parsed.data.id) return parsed.data.id;
    return 0;
  }

  function onFilesAdded(up, files) {
    // Iterate in reverse so splicing doesn't skip entries.
    for (let i = files.length - 1; i >= 0; i--) {
      const file = files[i];
      const native = file.getNative ? file.getNative() : null;
      if (!native || processed.has(native)) continue; // our replacement → leave for WP to tile.

      if (!BICR.shouldCompress(native)) {
        processed.add(native);
        continue; // not a target type / too small → let WP upload it untouched.
      }

      // Take the original away from plupload's queue AND from WP's handler so it
      // is neither uploaded raw nor left as a stuck "uploading" tile.
      up.removeFile(file);
      files.splice(i, 1);

      // Non-web sources (HEIC/TIFF/BMP) are always replaced with the converted
      // file; web formats are only replaced when the result is actually smaller.
      compressAndQueue(up, native, BICR.isConvert(native));
    }
  }

  function compressAndQueue(up, native, convert) {
    BICR.worker
      .compress(native, BICR.cfg.opts || {})
      .then((res) => {
        const blob = res?.blob;
        if (!blob || (blob.size >= native.size && !convert)) {
          requeue(up, native); // no gain → upload the original instead.
          return;
        }
        const out = new File([blob], BICR.outName(native, blob), { type: blob.type });
        processed.add(out); // skip our own re-entrant FilesAdded for this file.
        saved.set(out, { original: native.size, optimized: out.size });
        up.addFile(out); // fires a fresh WP tile that uploads + completes.
        reportSaving(native, out);
      })
      .catch(() => requeue(up, native)); // engine error → original, never block.
  }

  /** Re-add the untouched original (marked so we don't re-process it). */
  function requeue(up, native) {
    processed.add(native);
    up.addFile(native);
  }

  /** Log a one-line savings notice to the console (lightweight, no UI churn). */
  function reportSaving(before, after) {
    try {
      const pct = Math.round((1 - after.size / before.size) * 100);
      const tmpl = BICR.cfg.i18n?.saved || 'ImReso: optimized %1$s → %2$s (saved %3$s%%)';
      const msg = tmpl
        .replace('%1$s', humanSize(before.size))
        .replace('%2$s', humanSize(after.size))
        .replace('%3$s', String(pct));
      if (window.console?.info) console.info(msg);
    } catch {
      /* never let a logging error touch the upload */
    }
  }

  function humanSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
})();
