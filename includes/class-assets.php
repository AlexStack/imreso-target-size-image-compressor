<?php
/**
 * Enqueue the compression engine + plupload interceptor on the WordPress upload
 * screens only, and hand the browser its runtime config via wp_localize_script.
 *
 * @package ImReso
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class BICR_Assets
 *
 * Loads scripts on the four classic-uploader entry points (media library,
 * Add Media modal in the classic editor, media-new.php, and the Media Library
 * modal opened from the block editor — all of which run through plupload).
 */
class BICR_Assets {

	/**
	 * Hook the admin enqueue.
	 */
	public function register() {
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
		// The module worker is served as a static file with the right MIME by the
		// web server; no PHP needed. We only make sure long-cache headers are sane
		// by versioning the URL with BICR_VER (cache-busting on plugin update).
	}

	/**
	 * Enqueue scripts on upload-capable admin screens only.
	 *
	 * @param string $hook Current admin page hook suffix.
	 */
	public function enqueue( $hook ) {
		// Master on/off switch.
		if ( ! (int) get_option( 'bicr_enabled', 1 ) ) {
			return;
		}

		/*
		 * Every admin screen that can receive an image upload. The last two are
		 * the block-theme surfaces: on a block theme the Site Editor is where
		 * templates and most pages are edited, and the widgets screen is the
		 * block-based one — uploads there went uncompressed while every other
		 * screen was covered.
		 */
		$allowed = array(
			'upload.php',
			'post.php',
			'post-new.php',
			'media-new.php',
			'site-editor.php',
			'widgets.php',
		);
		if ( ! in_array( $hook, $allowed, true ) ) {
			return;
		}

		$base = BICR_URL . 'build/';

		// worker-client: main-thread wrapper + helpers (no DOM-heavy deps).
		wp_enqueue_script(
			'bicr-worker-client',
			$base . 'worker-client.js',
			array(),
			BICR_VER,
			true
		);

		// classic-uploader: hooks plupload.Uploader (the base class), so it covers
		// every WP uploader — the wp.Uploader-wrapped modal/grid AND the raw
		// plupload uploader on media-new.php + the list view. Depends on `plupload`
		// so window.plupload is defined before the hook installs.
		wp_enqueue_script(
			'bicr-classic',
			$base . 'classic-uploader.js',
			array( 'bicr-worker-client', 'plupload' ),
			BICR_VER,
			true
		);

		// block-uploader: wrap the block editor's mediaUpload setting (core/block-editor
		// store). Needs wp.data + wp.domReady. Every screen that mounts the block
		// editor shares that store, so the post editor, the Site Editor and the
		// block widgets screen all need it.
		if ( in_array( $hook, array( 'post.php', 'post-new.php', 'site-editor.php', 'widgets.php' ), true ) ) {
			$block_deps = array( 'bicr-worker-client' );
			foreach ( array( 'wp-data', 'wp-dom-ready' ) as $dep ) {
				if ( wp_script_is( $dep, 'registered' ) ) {
					$block_deps[] = $dep;
				}
			}
			wp_enqueue_script( 'bicr-blocks', $base . 'block-uploader.js', $block_deps, BICR_VER, true );
		}

		wp_localize_script(
			'bicr-worker-client',
			'BICR_CFG',
			array(
				'workerUrl' => $base . 'ir-worker.js?ver=' . BICR_VER, // ?ver busts the CDN cache on update.
				'wasmBase'  => $base,
				'minBytes'  => 10240,
				'opts'      => array(
					'format'      => (string) get_option( 'bicr_format', 'webp' ),       // auto|jpeg|webp|avif
					'quality'     => (int) get_option( 'bicr_quality', 72 ),             // 1-100 (used when targetBytes = 0)
					'maxDim'      => (int) get_option( 'bicr_maxdim', 1920 ),            // 0 = unlimited
					'targetBytes' => (int) get_option( 'bicr_target_kb', 500 ) * 1024,   // 0 = off (use quality)
				),
				'ajax'      => array(
					'url'   => admin_url( 'admin-ajax.php' ),
					'nonce' => wp_create_nonce( 'bicr_record' ),
				),
				'i18n'      => array(
					/* translators: %1$s original size, %2$s new size, %3$s percent saved. */
					'saved' => __( 'ImReso: optimized %1$s → %2$s (saved %3$s%%)', 'imreso-target-size-image-compressor' ),
				),
			)
		);
	}
}
