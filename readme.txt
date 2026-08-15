=== ImReso: Unlimited Target-Size Image Compressor ===
Contributors: imageresizer
Tags: image compressor, photo compressor, heic, photo resizer, compress images, picture resizer, heic to webp, avif
Requires at least: 6.5
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 1.0.12
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Resize & compress images/photos to a target KB or max width. Free, unlimited, privacy-first — only in browser, no server, no API, no signup.

== Description ==

**Source code:** nothing here is obfuscated. The un-minified sources for every
file under `build/` ship inside this plugin in `src-js/`, together with the
`build.mjs` bundler config and the `package.json` that pins each dependency, and
they are also public at **https://github.com/AlexStack/imreso-target-size-image-compressor**.
Run `npm install && npm run build` in the plugin folder to reproduce `build/`.
Full details, including the upstream source of every bundled library and `.wasm`
codec, are under "Source code" and "Third-party libraries" below.

**ImReso is a target-size, free bulk image compressor.** It resizes and converts your photos and images to exact pixel dimensions or a specific file size, right in your browser — instantly. Free, unlimited and 100% privacy-first: the encoding runs on your own device and nothing is ever uploaded. Need 50 KB or 1000px? No problem.

Most plugins in this space hand your files to a third-party server or an external API. ImReso is different — client-side image compression, so your originals never leave your site, with no API key, no per-file cost, no monthly cap and no bulk-job timeout, even on the cheapest shared hosting.

Give it a size ceiling in KB and each upload is encoded to land under it automatically — no fiddling with a quality slider. ImReso reads JPEG, PNG, WebP, AVIF, HEIC/HEIF, TIFF and BMP, and writes WebP, AVIF or JPEG; SVG and animated GIF are passed through untouched so nothing ever breaks.

It runs the same engine as **[ImageResizer.cc](https://imageresizer.cc/)**, the free online tool by the same team. Need to handle a one-off file without opening WordPress? Use the web app at **[imageresizer.cc/app](https://imageresizer.cc/app)** — same engine, any browser, nothing uploaded.

= See it in action =

**Set your output format, target size and quality:**
![The ImReso settings](https://ps.w.org/imreso-target-size-image-compressor/assets/screenshot-1.png)

**Watch the space add up — every image, before and after:**
![The savings dashboard with before/after sizes](https://ps.w.org/imreso-target-size-image-compressor/assets/screenshot-2.png)

**Upload in the block (post/page) editor — compressed automatically:**
![Block editor image upload is auto-compressed](https://ps.w.org/imreso-target-size-image-compressor/assets/screenshot-3.png)

**Bulk-upload in the Media Library — each photo optimized before it is stored:**
![Media Library bulk upload is auto-compressed](https://ps.w.org/imreso-target-size-image-compressor/assets/screenshot-4.png)

= What makes it different =

* **Zero server load** — all the work runs in the browser via WebAssembly, so nothing times out and your host isn't taxed, even on cheap shared hosting.
* **Nothing is uploaded** — your originals never leave the site; the browser does all the work.
* **No API key, no signup, no limits** — none of the TinyPNG-style credits, monthly quotas or accounts. Free, unlimited image compression, always.
* **Target file size** — hit an exact size (100, 300, 500 KB…), not just a guessed quality value.
* **Max width** — scale huge photos down to a longest-edge cap before they are stored.
* **HEIC to WebP or AVIF** — turn iPhone photos and other heavy formats into modern, lighter ones on upload.
* **Leaner thumbnails** — the sub-sizes WordPress builds on the server use your chosen quality too.
* **Works everywhere** — Safari, iOS and every modern browser; fully translatable, with language packs delivered by WordPress.

= Supported formats =

* **Read / resize / compress:** JPEG, PNG, WebP, AVIF, BMP, TIFF.
* **Read & convert to a web format:** HEIC / HEIF (iPhone), plus TIFF and BMP.
* **Output:** WebP, AVIF or JPEG (chosen automatically or fixed in settings).
* **Left untouched (uploaded as-is):** animated GIF (re-encoding would drop frames), SVG (vector), ICO and JPEG 2000. These are uploaded unchanged so nothing is ever broken.

= What gets optimized =

Everything you add in wp-admin: the **classic Media Library**, the **"Add Media" dialog**, the **Add New Media** screen, the **Media Library popup**, and **inline uploads in the block (post/page) editor** — drag-and-drop, paste, and the block "Upload" button.

Programmatic / REST / WP-CLI / FTP uploads cannot be processed by any client-side tool, including this one.

= About ImageResizer.cc =

This plugin is made by the team behind **[ImageResizer.cc](https://imageresizer.cc/)** — a free, privacy-first online tool to resize, compress and convert images entirely in the browser. The plugin brings that same engine straight into your WordPress upload flow.

Working outside WordPress? The web app handles the same jobs with no install: [compress an image to a target size](https://imageresizer.cc/app), convert HEIC to JPG, or convert PNG to WebP — all client-side, nothing uploaded, no account.

= Source code =

Nothing in this plugin is obfuscated. The files under `build/` are minified for delivery only, and the complete, un-minified sources that produce them ship inside the plugin — and are public at **https://github.com/AlexStack/imreso-target-size-image-compressor**:

* `src-js/` — every TypeScript/JavaScript source file (worker engine, main-thread client, uploader interceptors, format sniffer). `build/ir-worker.js`, `build/worker-client.js`, `build/classic-uploader.js` and `build/block-uploader.js` are built from these.
* `build.mjs` — the esbuild configuration that bundles `src-js/` into `build/`.
* `package.json` — pins the exact third-party versions listed below.

The files under `build/chunks/` are not our code: they are the published distribution files of the third-party codec packages, copied verbatim by the bundler. Each one's upstream source is linked in "Third-party libraries" below — `encode-*.js`, `avif_enc*.js` and `webp_enc*.js` come from @jsquash, `UTIF-*.js` from utif2, and `heic-to-*.js` from heic-to.

To regenerate everything in `build/` from those sources, run this from the plugin folder:

`npm install && npm run build`

The rebuilt `build/` is functionally identical: the four `.wasm` codecs and the three top-level bundles come out byte-for-byte the same. The lazily loaded chunks under `build/chunks/` carry an esbuild content hash in their filename (`heic-to-<hash>.js`), and that hash depends on the directory the build ran in, so those filenames — and the import statements in `ir-worker.js` that reference them — will differ from the shipped copy. The chunk contents themselves are unchanged, and each `build/` is internally consistent. The hash is what stops browsers serving a stale chunk after a plugin update.

= The .wasm files =

`build/` contains four WebAssembly binaries. They are the image encoders themselves — the plugin exists to compress images on the user's own device instead of on a server or an external API, and these are what performs that encoding. Without them the plugin has no function at all.

They are the stock, unmodified binaries published by the `@jsquash` packages: `npm install` fetches byte-identical files and `build.mjs` copies them next to the bundle. Nothing is fetched at runtime — they are loaded from the plugin folder, which is what keeps every image on the user's own device.

Each is compiled from a public, GPL-compatible upstream C/C++ project:

* `webp_enc.wasm`, `webp_enc_simd.wasm` — libwebp (BSD-3-Clause) — https://chromium.googlesource.com/webm/libwebp
* `mozjpeg_enc.wasm` — mozjpeg (BSD-3-Clause / IJG) — https://github.com/mozilla/mozjpeg
* `avif_enc.wasm` — libavif (BSD-2-Clause) — https://github.com/AOMediaCodec/libavif — with libaom — https://aomedia.googlesource.com/aom

The build scripts that produce these binaries from those sources are published by jSquash at https://github.com/jamsinclair/jSquash.

= Third-party libraries =

This plugin bundles the following GPL-compatible open-source libraries. Their licences are reproduced in each package under `node_modules/` after `npm install`, and upstream sources are linked below.

* **@jsquash/avif**, **@jsquash/webp**, **@jsquash/jpeg** — Apache-2.0 — WebAssembly image codecs — https://github.com/jamsinclair/jSquash
* **heic-to** — LGPL-3.0 — HEIC/HEIF decoding (wraps libheif) — https://github.com/hoppergee/heic-to
* **utif2** — MIT — TIFF decoding — https://github.com/photopea/UTIF.js

The codec binaries these packages ship are compiled from **libwebp** (BSD-3-Clause), **mozjpeg** (BSD-3-Clause / IJG), **libavif** + **libaom** (BSD-2-Clause with the Alliance for Open Media patent grant) and **libheif** (LGPL-3.0).

Because libheif and heic-to are LGPL-3.0, the combined work is distributed under **GPLv3** as permitted by this plugin's "GPLv2 or later" licence.

== Installation ==

1. Upload the `imreso-target-size-image-compressor` folder to `/wp-content/plugins/`, or install the .zip via Plugins → Add New → Upload Plugin.
2. Activate the plugin.
3. Go to **the ImReso menu** and adjust the **ImReso** options (format, quality, max dimension) if you like — sensible defaults are set automatically.
4. Upload images through the Media Library — they are resized and compressed in your browser before they are stored.

== Frequently Asked Questions ==

= Can I bulk compress and resize images? =
Yes. Select as many images as you like in the Media Library or "Add Media" dialog and each one is resized and compressed in your browser before upload. There is no per-image limit and nothing is queued on a server.

= Can I compress to a specific file size? =
Yes. Set the "Max compress size" in the ImReso menu (default 500 KB) and the plugin searches the encoder quality so each image lands at about that size. Set it to 0 to use a fixed Quality value instead.

= Can I compress images without a server or external API? =
Yes — that is the whole point. All processing happens in your browser, so the free plugin makes **zero external network requests**. Your images are never sent to our servers or anyone else's.

= Is there a limit on how many images I can optimize? =
No. It is genuinely unlimited — there is nothing to meter because the work runs on your own device.

= Which image formats are supported? =
It reads JPEG, PNG, WebP, AVIF, BMP, TIFF and HEIC/HEIF, and outputs WebP, AVIF or JPEG. Animated GIF, SVG, ICO and JPEG 2000 are left untouched and uploaded as-is.

= Can it handle iPhone HEIC photos? =
Yes. HEIC/HEIF images are decoded and converted to WebP, AVIF or JPEG entirely in your browser, so they're viewable everywhere. The conversion is client-side; the original HEIC is only kept if conversion isn't available, so an upload is never lost.

= Does it optimize images already in my Media Library? =
Not yet. This release resizes and compresses **new uploads**. Bulk optimization of the existing library is planned for a later release.

= AVIF seems slow on my phone. =
AVIF encoding is CPU-heavy. On mobile devices the plugin automatically prefers WebP for reliability. You can also fix the format to WebP in the ImReso menu.

= What happens if compression fails or doesn't help? =
The original file is uploaded unchanged. Compression never blocks or breaks an upload.

= Does the plugin update automatically? =
Yes. Updates are delivered by WordPress.org like any other plugin from the directory — you will see them on the Plugins screen, and you can switch on "Enable auto-updates" there to have them installed for you. The plugin ships no updater of its own and contacts no server to check for updates.

= What languages is the plugin available in? =
Every string in the interface is translatable, and translations are delivered by WordPress itself: once your site's locale has been translated at translate.wordpress.org, WordPress installs and updates the language pack for you, with no action needed here. Contributions for any locale are welcome at https://translate.wordpress.org/projects/wp-plugins/imreso-target-size-image-compressor/

== Screenshots ==

1. The ImReso settings: output format, target size, max-dimension and quality.
2. The savings dashboard: recently optimized images with before / after size and percent saved.
3. Block (post/page) editor — images you upload are compressed in your browser automatically.
4. Media Library — bulk-uploaded images are each resized and compressed before they are stored.

== Changelog ==

= 1.0.12 =
* Translations are now delivered by WordPress from translate.wordpress.org instead of being bundled in the plugin, so they update independently of releases and any locale can be contributed by the community.
* Documented the source of every compiled file up front: the un-minified sources in `src-js/`, the public repository, the upstream project behind each vendored bundle, and the C/C++ project each `.wasm` codec is compiled from.

= 1.0.11 =
* Renamed to ImReso (a distinctive brand for the plugin; ImageResizer.cc remains the author). Your settings and savings history are unaffected.
* Rewrote the description around what the plugin does differently — in-browser encoding, target file size, privacy — with natural wording instead of repeated keywords.

= 1.0.10 =
* Fixed: images were not compressed on upload since 1.0.8. The interceptor hooked `plupload.Uploader.prototype.init`, but plupload assigns its methods per-instance, so that prototype hook never ran and uploads were stored uncompressed. It now wraps the `plupload.Uploader` constructor — the single point every WordPress uploader passes through — so the Media Library, the "Add Media" modal, the "Add New Media" screen and the Media Library list view are all covered again.

= 1.0.9 =
* Moved every option, setting, admin page slug, AJAX action and attachment meta key from the short `ir_` prefix to the unique `bicr_` prefix, so nothing can collide with another plugin. Your existing settings and savings history are migrated automatically on update — no action needed.
* The un-minified JavaScript sources (`src-js/`), the build script and the dependency manifest now ship inside the plugin, so anyone can inspect or rebuild the delivered code with `npm install && npm run build`.
* Documented every bundled third-party library and its licence in the readme.
* Removed a duplicate "Settings saved." notice in favour of the one WordPress already renders.
* Fixed: the Quality setting was also being applied to PNG and GIF thumbnails, where image editors read that number as a compression level rather than a visual quality. It now applies only to JPEG, WebP and AVIF sub-sizes; PNG and GIF keep WordPress's own default.
* Fixed: the "Recent images" table ran a database query per row. It now loads all rows in two queries.
* Added "Free online image resizer" and "Support" links under the plugin's row on the Plugins screen, and a small credit line in the footer of the plugin's own settings page. Nothing is ever added to the front end of your site.

= 1.0.8 =
* Fixed: images uploaded on the "Add New Media" screen and the Media Library list view were not compressed. The interceptor now hooks plupload directly, so it covers every upload screen — not only the "Add Media" modal and the Media Library grid.

= 1.0.7 =
* Listing & metadata refresh: corrected the contributor account, refreshed the search tags, tightened the short description, and confirmed compatibility with WordPress 7.0. No changes to plugin functionality.

= 1.0.6 =
* Expanded the bundled translations from 8 to 30 languages, adding Korean, Italian, Dutch, Polish, European Portuguese, Ukrainian, Turkish, Indonesian, Vietnamese, Thai, Swedish, Norwegian, Danish, Finnish, Czech, Slovak, Hungarian, Romanian, Greek, Arabic, Hebrew and Persian (right-to-left locales included).

= 1.0.5 =
* Fixed block editor uploads still not compressing on WordPress 6.8+: WordPress's uploadMedia exports are read-only, so the interceptor now wraps the editor's mediaUpload setting in the core/block-editor store instead of the (unwritable) global.

= 1.0.4 =
* Fixed block editor (post/page) image uploads not being compressed on WordPress 6.8+, which uses the new /upload-media handler — the interceptor now wraps it too.

= 1.0.3 =
* New: a dedicated admin menu page showing your settings, total savings, and a table of recently optimized images (before / after).

= 1.0.2 =
* Added block editor support: inline image uploads in the post/page editor are now compressed too (previously only the classic uploader was covered).
* Added savings reporting: an "Optimized" column in the Media Library, a "Saved %" line in the attachment details, and a running total on the plugin menu.

= 1.0.1 =
* Fixed bulk uploads getting stuck on "uploading…" in the Media Library: the interceptor now runs before WordPress's own upload handler (so it no longer orphans tiles), and image jobs are processed one at a time to keep memory and the WASM codec stable during large batches.

= 1.0.0 =
* Initial release: client-side bulk resize & compress on upload (output WebP / AVIF / JPEG) for the classic uploader, with an exact target-size mode, a max-dimension cap, quality control, and leaner server-generated thumbnail sizes.
* Reads JPEG, PNG, WebP, AVIF, BMP and TIFF, and converts HEIC/HEIF (iPhone) photos to a web format on upload.
* Bundled translations for 8 languages (zh-CN, zh-TW, ja, es, fr, de, pt-BR, ru).

== Upgrade Notice ==

= 1.0.10 =
Fixes on-upload compression being silently skipped since 1.0.8. Update to restore automatic image optimization on every upload screen.

= 1.0.9 =
Internal option and meta keys move to a unique `bicr_` prefix. Existing settings and savings history migrate automatically on update.

= 1.0.0 =
First release.
