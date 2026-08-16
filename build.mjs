/**
 * Build the shippable JS/WASM artifacts into build/.
 *
 *  - ir-worker.js        ESM module worker (engine), with single-threaded codec
 *                        chunks split out so only the needed one loads at runtime.
 *  - worker-client.js    IIFE, main-thread protocol + helpers.
 *  - classic-uploader.js IIFE, plupload interceptor.
 *  - *.wasm              codec binaries copied next to the bundle for the
 *                        worker's init({ locateFile }) override.
 *
 * Build from this folder with `npm install && npm run build`. Node's upward
 * module resolution also picks up the monorepo's node_modules when built
 * in-repo, so no separate install is needed there.
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(root, 'build');
const require = createRequire(import.meta.url);

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const shared = {
	bundle: true,
	// Minified for delivery. wordpress.org allows this ONLY because the
	// un-minified sources that produce these files ship in the same package
	// (src-js/ + this script + package.json) — see readme.txt "Source code".
	minify: true,
	sourcemap: false,
	// Keep any comment esbuild recognises as legal (/*! …, @license, @preserve),
	// moved to the end of the file it came from. That does NOT cover everything:
	// @jsquash marks its Apache-2.0 headers with a plain /** block and the
	// emscripten codec bodies carry no header at all, so minification would drop
	// those notices entirely. Apache-2.0 §4(b) and LGPL-3.0 both require them to
	// travel with the distribution, so the full texts ship in licenses/ instead.
	legalComments: 'eof',
	// Scoped deliberately: several outputs are wholly third-party (the codec
	// chunks — heic-to alone is ~3 MB of LGPL libheif with no plugin code in it),
	// so the banner claims GPLv2+ over THIS PLUGIN'S code only, rather than
	// asserting one licence over a whole file it does not own.
	banner: {
		js: '/*! ImReso: Unlimited Target-Size Image Compressor — plugin code (c) ImageResizer.cc, GPLv2 or later. Bundled third-party code keeps its own licence: see licenses/ and readme.txt. */',
	},
	target: ['es2020', 'safari15', 'chrome90', 'firefox90'],
	// Force single-threaded codecs (no COOP/COEP needed); keeps the multi-thread
	// AVIF variant + its nested worker out of the bundle entirely.
	alias: { 'wasm-feature-detect': resolve(root, 'src-js/wfd-shim.js') },
};

// Stub the multi-threaded codec variants so they're never bundled. threads() is
// hard-false (wfd-shim), so this branch is unreachable at runtime anyway; the
// stub just keeps the orphan chunk + its 3.4 MB wasm out of the shipped zip.
const stubMtPlugin = {
	name: 'stub-mt-codecs',
	setup(b) {
		b.onResolve({ filter: /_mt\.js$/ }, (a) => ({ path: a.path, namespace: 'mt-stub' }));
		b.onLoad({ filter: /.*/, namespace: 'mt-stub' }, () => ({
			contents: 'export default () => { throw new Error("multi-threaded codec disabled"); };',
		}));
	},
};

// 1) Module worker (ESM + code splitting → lazy single-threaded codec chunks).
await build({
	...shared,
	entryPoints: { 'ir-worker': resolve(root, 'src-js/ir-worker-entry.ts') },
	format: 'esm',
	splitting: true,
	outdir,
	loader: { '.wasm': 'file' },
	assetNames: '[name]',
	chunkNames: 'chunks/[name]-[hash]',
	plugins: [stubMtPlugin],
});

// 2) Plain global scripts (IIFE; no module features needed).
await build({
	...shared,
	entryPoints: [
		resolve(root, 'src-js/worker-client.js'),
		resolve(root, 'src-js/classic-uploader.js'),
		resolve(root, 'src-js/block-uploader.js'),
	],
	format: 'iife',
	outdir,
});

// 3) Copy every codec wasm a single-threaded/SIMD path can request next to the
//    bundle (the worker's init({ locateFile }) resolves them here). WebP picks
//    the SIMD variant when available and the plain one otherwise, so ship both.
const wasm = [
	'@jsquash/avif/codec/enc/avif_enc.wasm',
	'@jsquash/webp/codec/enc/webp_enc.wasm',
	'@jsquash/webp/codec/enc/webp_enc_simd.wasm',
	'@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm',
];
const wasmProvenance = [];
for (const spec of wasm) {
	const src = require.resolve(spec);
	const name = spec.split('/').pop();
	cpSync(src, resolve(outdir, name));
	wasmProvenance.push({ name, spec });
}

// 4) Drop a plain-text manifest beside the output. Reviewers and users who open
//    build/ first — reasonably, since that is where the unreadable files are —
//    should not have to go back to readme.txt to learn what each file is and
//    where it came from. Generated here so it can never drift from the build.
writeFileSync(
	resolve(outdir, 'README.txt'),
	`What is in this directory
=========================

Everything here is generated. Nothing in it is hand-edited, and nothing is
obfuscated: it is minified for delivery only. Rebuild it all from the sources
that ship alongside it, in the plugin folder:

    npm install && npm run build

The complete, un-minified sources are in ../src-js/, the build that produces
this directory is ../build.mjs, and the whole plugin is public at

    https://github.com/AlexStack/imreso-target-size-image-compressor


Built from ../src-js/
---------------------

    ir-worker.js         <- src-js/ir-worker-entry.ts + src-js/format.ts
    worker-client.js     <- src-js/worker-client.js
    classic-uploader.js  <- src-js/classic-uploader.js
    block-uploader.js    <- src-js/block-uploader.js
    chunks/chunk-*.js    <- one is src-js/wfd-shim.js; the other is esbuild's
                            own CommonJS interop runtime


Third-party, bundled by esbuild from the npm packages in ../package.json
-----------------------------------------------------------------------

    chunks/encode-*.js        @jsquash/{avif,webp,jpeg}   Apache-2.0
    chunks/avif_enc*.js       @jsquash/avif               Apache-2.0
    chunks/webp_enc*.js       @jsquash/webp               Apache-2.0
    chunks/UTIF-*.js          utif2 (bundles pako)        MIT / MIT AND Zlib
    chunks/heic-to-*.js       heic-to                     LGPL-3.0

heic-to is libheif compiled to plain JavaScript, which is why it is ~3 MB and
why HEIC decoding needs no extra binary. Full licence texts for all of the
above are in ../licenses/.


The .wasm files
---------------

${wasmProvenance.map((w) => `    ${w.name.padEnd(20)} ${w.spec}`).join('\n')}

These four are the image encoders. This plugin exists to compress images on the
visitor's own device instead of on a server or through an external API, and
these binaries are what performs that encoding — without them the plugin does
nothing at all. They are copied byte-for-byte from the @jsquash packages that
npm install fetches; this build does not compile them. Each is built upstream
from a public, GPL-compatible C/C++ project:

    webp_enc.wasm        libwebp    BSD-3-Clause
    webp_enc_simd.wasm   libwebp    BSD-3-Clause
    mozjpeg_enc.wasm     mozjpeg    BSD-3-Clause / IJG
    avif_enc.wasm        libavif + libaom   BSD-2-Clause

    https://chromium.googlesource.com/webm/libwebp
    https://github.com/mozilla/mozjpeg
    https://github.com/AOMediaCodec/libavif
    https://github.com/jamsinclair/jSquash

They are loaded from this directory and never fetched from anywhere else, which
is what keeps every image on the user's own device.
`,
);

console.log('Build complete →', outdir);
