/**
 * Drop-in replacement for `wasm-feature-detect`, aliased in build.mjs.
 *
 * jSquash's whole premise is running WASM codecs single-threaded WITHOUT
 * cross-origin isolation (no COOP/COEP) — exactly the WordPress admin case. The
 * multi-threaded (`_mt`) AVIF variant needs SharedArrayBuffer plus a nested
 * worker we deliberately don't ship, so we force `threads()` to false and the
 * codec wrappers always pick the single-threaded path.
 *
 * `simd()` is kept real (the upstream probe, inlined) because SIMD needs no
 * isolation and the WebP encoder uses it for a free speed-up; we ship both the
 * SIMD and non-SIMD WebP wasm so either branch works.
 */
export const simd = async () =>
  WebAssembly.validate(
    new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253,
      15, 253, 98, 11,
    ]),
  );

export const threads = async () => false;
