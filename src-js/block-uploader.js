/**
 * ImageResizer.cc — block editor interceptor.
 *
 * The block editor uploads inline images by calling the `mediaUpload` function
 * in the core/block-editor store settings. WordPress builds that from a package
 * export — wp.uploadMedia.uploadMedia (WP 6.8+) or wp.mediaUtils.uploadMedia —
 * which are READ-ONLY webpack getters, so reassigning the global is impossible
 * (it silently no-ops). Instead we wrap the store's mediaUpload setting itself,
 * which is a normal writable value and is exactly what the image block calls.
 * A subscribe() re-applies the wrap if the editor ever resets its settings.
 *
 * Covers inline image-block uploads, drag-and-drop, and paste in the post/page
 * editor. The classic Media Library / "Add Media" modal go through plupload and
 * are handled by classic-uploader.js.
 */
(() => {
  if (!window.wp || !wp.data || !wp.domReady || !window.BICR || !BICR.worker) return;

  wp.domReady(() => {
    let patching = false;
    const apply = () => {
      if (patching) return;
      const store = wp.data.select('core/block-editor');
      if (!store || typeof store.getSettings !== 'function') return;
      const current = store.getSettings().mediaUpload;
      if (typeof current !== 'function' || current.__bicrWrapped) return;
      const wrapped = wrap(current);
      wrapped.__bicrWrapped = true;
      patching = true;
      wp.data.dispatch('core/block-editor').updateSettings({ mediaUpload: wrapped });
      patching = false;
      if (window.console && console.info) {
        console.info('ImReso: block editor upload hooked.');
      }
    };
    apply();
    wp.data.subscribe(apply); // re-apply if the editor replaces its settings.
  });

  /** Wrap a mediaUpload(): compress filesList first, then delegate; record savings. */
  function wrap(original) {
    return function (options) {
      const opts = options || {};
      const list = opts.filesList ? Array.from(opts.filesList) : [];
      if (!list.length) return original.call(this, opts);

      Promise.all(list.map(maybeCompress)).then((results) => {
        const savings = results.map((r) => r.saved);
        original.call(
          this,
          Object.assign({}, opts, {
            filesList: results.map((r) => r.file),
            onFileChange: (attachments) => {
              recordFromAttachments(attachments, savings);
              if (typeof opts.onFileChange === 'function') opts.onFileChange(attachments);
            },
          }),
        );
      });
    };
  }

  /** Compress one file; resolve to { file, saved } where saved is null if unchanged. */
  function maybeCompress(file) {
    if (!BICR.shouldCompress(file)) return Promise.resolve({ file, saved: null });
    const convert = BICR.isConvert(file);
    return BICR.worker
      .compress(file, BICR.cfg.opts || {})
      .then((res) => {
        const blob = res && res.blob;
        if (!blob || (blob.size >= file.size && !convert)) return { file, saved: null };
        const out = new File([blob], BICR.outName(file, blob), { type: blob.type });
        return { file: out, saved: { original: file.size, optimized: out.size } };
      })
      .catch(() => ({ file, saved: null }));
  }

  /** onFileChange fires repeatedly; record each attachment's savings exactly once. */
  function recordFromAttachments(attachments, savings) {
    if (!Array.isArray(attachments)) return;
    attachments.forEach((att, i) => {
      const s = savings[i];
      if (att && att.id && s && !s.recorded) {
        s.recorded = true;
        BICR.recordSaving(att.id, s.original, s.optimized);
      }
    });
  }
})();
