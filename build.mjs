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
import { cpSync, mkdirSync, rmSync } from 'node:fs';
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
	legalComments: 'none',
	// A retained copyright/trademark banner on every output file (esbuild keeps
	// this even with legalComments: 'none').
	banner: {
		js: '/*! ImReso: Unlimited Target-Size Image Compressor | (c) ImageResizer.cc | GPLv2 or later | https://ImageResizer.cc */',
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
for (const spec of wasm) {
	const src = require.resolve(spec);
	const name = spec.split('/').pop();
	cpSync(src, resolve(outdir, name));
}

console.log('Build complete →', outdir);
