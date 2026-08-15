# ImReso: Unlimited Target-Size Image Compressor

Source code for the WordPress plugin [ImReso](https://wordpress.org/plugins/imreso-target-size-image-compressor/) — it resizes and compresses images to an exact target file size or pixel dimension **in the browser**, on upload, using WebAssembly codecs. Nothing is uploaded to a server or an external API, so there is no API key, no per-file cost and no bulk-job timeout.

Made by the team behind [ImageResizer.cc](https://imageresizer.cc/).

## Why this repository exists

The published plugin ships minified files under `build/`. This repository holds the complete, un-minified sources those files are built from, so anyone can review, rebuild or fork them. The same sources also ship inside the plugin package itself.

## Layout

| Path | What it is |
| --- | --- |
| `imreso-target-size-image-compressor.php` | Plugin bootstrap and headers |
| `includes/` | PHP: admin settings page, asset loading, sub-size quality filter, savings stats |
| `src-js/` | The un-minified TypeScript/JavaScript that `build/` is compiled from |
| `build.mjs` | esbuild configuration — the entire build |
| `package.json` | Pins the exact third-party codec versions |
| `languages/` | Gettext catalogues, kept for the self-hosted build (the wordpress.org package omits them — see below) |

## Building

```
npm install && npm run build
```

That produces `build/` (gitignored here), which is what the released plugin loads. The four `.wasm` codecs and the three top-level bundles rebuild byte-for-byte identically. The lazily loaded files under `build/chunks/` carry an esbuild content hash that depends on the build directory, so those filenames differ between builds while their contents do not.

## Third-party code

`build/chunks/` contains the published distribution files of the codec packages, copied verbatim by the bundler — they are not this project's code. The `.wasm` binaries are the stock, unmodified builds published by [@jsquash](https://github.com/jamsinclair/jSquash), compiled from:

- **libwebp** (BSD-3-Clause) — <https://chromium.googlesource.com/webm/libwebp>
- **mozjpeg** (BSD-3-Clause / IJG) — <https://github.com/mozilla/mozjpeg>
- **libavif** (BSD-2-Clause) + **libaom** — <https://github.com/AOMediaCodec/libavif>
- **libheif** (LGPL-3.0), via [heic-to](https://github.com/hoppergee/heic-to)
- **utif2** (MIT) — <https://github.com/photopea/UTIF.js>

Because libheif and heic-to are LGPL-3.0, the combined work is distributed under GPLv3, as the plugin's "GPLv2 or later" licence permits.

## Translations

The wordpress.org package does not bundle translations — the directory builds and delivers them through [translate.wordpress.org](https://translate.wordpress.org/projects/wp-plugins/imreso-target-size-image-compressor/), and contributions for any locale are welcome there. The catalogues in `languages/` are kept for the self-hosted build, which has no such source.

## Licence

GPLv2 or later. See the header of the main plugin file for the full notice.

"ImageResizer.cc" is a trademark of its owner; the licence does not grant permission to use it in derivative works.
