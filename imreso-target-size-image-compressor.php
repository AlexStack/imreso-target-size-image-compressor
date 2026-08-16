<?php
/**
 * Plugin Name:       ImReso: Unlimited Target-Size Image Compressor
 * Plugin URI:        https://github.com/AlexStack/imreso-target-size-image-compressor
 * Description:       Compress & resize images to a target file size right in your browser, on upload — zero server load, no API key, no signup. Free and unlimited. By ImageResizer.cc.
 * Version:           1.0.16
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * Author:            ImageResizer
 * Author URI:        https://profiles.wordpress.org/imageresizer/
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       imreso-target-size-image-compressor
 *
 * No "Domain Path" header and no bundled catalogues: WordPress.org serves
 * translations for directory-hosted plugins from translate.wordpress.org, and
 * shipping .po/.mo inside the package is not permitted. Core installs the
 * language packs into wp-content/languages/plugins/ and loads them just in time
 * from the Text Domain alone. The repo keeps languages/ for the self-hosted Pro
 * build, which has no translate.wordpress.org to draw from; scripts/make-zip.sh
 * excludes the whole directory from the wordpress.org package.
 *
 * ImReso: Unlimited Target-Size Image Compressor
 * Copyright (C) 2026 ImageResizer.cc — https://ImageResizer.cc
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 2 of the License, or (at your option) any later
 * version.
 *
 * "ImageResizer.cc" is a trademark of its owner; this licence does not grant
 * permission to use it in derivative works.
 *
 * Bundled third-party libraries and their licences are credited in readme.txt
 * ("Third-party libraries"); the un-minified sources for everything in build/
 * ship in src-js/ and rebuild with `npm install && npm run build`.
 *
 * Licence of the package as distributed: this plugin's own code is GPLv2 or
 * later, but it bundles heic-to/libheif (LGPL-3.0), so the combined work ships
 * effectively under GPLv3 or later — which "or later" expressly permits. No
 * GPLv2-only component is bundled (in particular, no x265 encoder), so there is
 * no licence conflict.
 *
 * DO NOT add an "Update URI" header. For a plugin hosted in the WordPress.org
 * directory the header must be absent (or exactly the w.org URL for this slug);
 * any other value makes the WordPress.org API silently stop serving updates,
 * which would break automatic updates for every user.
 *
 * @package ImReso
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'BICR_FILE', __FILE__ );
define( 'BICR_VER', '1.0.16' ); // bump on every release so versioned admin assets bust the CDN cache.
define( 'BICR_DIR', plugin_dir_path( __FILE__ ) );
define( 'BICR_URL', plugin_dir_url( __FILE__ ) );

require_once BICR_DIR . 'includes/class-assets.php';
require_once BICR_DIR . 'includes/class-settings.php';
require_once BICR_DIR . 'includes/class-subsizes.php';
require_once BICR_DIR . 'includes/class-stats.php';

/**
 * Boot the plugin: register the upload-screen assets, the settings page and the
 * server-side sub-size quality filter. Each concern lives in its own class.
 *
 * No load_plugin_textdomain() call: core loads the wordpress.org language pack
 * just-in-time from the Text Domain alone (it has done so since 4.6, and we
 * require 6.5).
 */
function bicr_bootstrap() {
	bicr_maybe_upgrade();

	( new BICR_Assets() )->register();
	( new BICR_Settings() )->register();
	( new BICR_Subsizes() )->register();
	( new BICR_Stats() )->register();
}
add_action( 'plugins_loaded', 'bicr_bootstrap' );

/**
 * Run one-time data migrations after an update, keyed on the stored version.
 * `bicr_version` is autoloaded, so the happy path is a single in-memory compare.
 */
function bicr_maybe_upgrade() {
	$installed = get_option( 'bicr_version' );
	if ( BICR_VER === $installed ) {
		return;
	}

	/*
	 * `bicr_version` arrived in 1.0.9, so a missing value means the plugin has
	 * never stamped it: either a fresh install (migration finds nothing and does
	 * one indexed lookup) or an update from <= 1.0.8, the only release line that
	 * wrote `ir_`-prefixed data. Once a version is recorded, later bumps skip the
	 * migration and its direct postmeta query entirely.
	 */
	if ( false === $installed ) {
		bicr_migrate_legacy_prefix();
	}

	update_option( 'bicr_version', BICR_VER );
}

/**
 * Releases up to 1.0.8 stored their data under the too-generic `ir_` prefix.
 * Carry those values over to `bicr_` once, then drop the originals. Skips any
 * key the user has already set under the new name.
 */
function bicr_migrate_legacy_prefix() {
	$options = array(
		'ir_enabled'    => 'bicr_enabled',
		'ir_format'     => 'bicr_format',
		'ir_target_kb'  => 'bicr_target_kb',
		'ir_maxdim'     => 'bicr_maxdim',
		'ir_quality'    => 'bicr_quality',
		'ir_stats'      => 'bicr_stats',
	);
	foreach ( $options as $old => $new ) {
		$value = get_option( $old, null );
		if ( null === $value ) {
			continue;
		}
		// The aggregate is read only on the settings screen — keep it off autoload.
		add_option( $new, $value, '', 'bicr_stats' === $new ? false : true );
		delete_option( $old );
	}

	bicr_migrate_legacy_meta();
}

/**
 * Rename the per-attachment `_ir_saved` meta key to `_bicr_saved` in one query,
 * then invalidate the meta cache for just the affected attachments.
 */
function bicr_migrate_legacy_meta() {
	global $wpdb;

	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
	$ids = $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT post_id FROM {$wpdb->postmeta} WHERE meta_key = %s", '_ir_saved' ) );
	if ( ! $ids ) {
		return;
	}

	/*
	 * The two `meta_key` entries below name the postmeta COLUMN being written and
	 * matched on — they are not a WP_Query `meta_key` argument. SlowDBQuery cannot
	 * tell the two apart and flags any array key spelled `meta_key`, so it is
	 * suppressed here: renaming the key in a single indexed UPDATE is precisely
	 * the cheap path, and this runs once, only on an upgrade from <= 1.0.8.
	 */
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.SlowDBQuery.slow_db_query_meta_key
	$wpdb->update( $wpdb->postmeta, array( 'meta_key' => '_bicr_saved' ), array( 'meta_key' => '_ir_saved' ) );

	foreach ( $ids as $id ) {
		wp_cache_delete( (int) $id, 'post_meta' );
	}
}

/**
 * Allow HEIC/HEIF selection in the uploader so the browser engine can convert
 * iPhone photos to WebP/AVIF/JPEG before storage. The compressed file replaces
 * the original client-side, so WordPress normally never stores the raw HEIC; on
 * the rare fallback (JS disabled / decode failure) the original is kept, which
 * is preferable to losing the upload.
 *
 * @param array $mimes Allowed mime types keyed by extension pattern.
 * @return array
 */
function bicr_allow_heic_mimes( $mimes ) {
	if ( ! (int) get_option( 'bicr_enabled', 1 ) ) {
		return $mimes;
	}
	$mimes['heic'] = 'image/heic';
	$mimes['heif'] = 'image/heif';
	return $mimes;
}
add_filter( 'upload_mimes', 'bicr_allow_heic_mimes' );

/**
 * Canonical URL back to the project site, tagged so we can tell plugin referrals
 * apart from organic traffic. Only ever used for admin-side links — never
 * injected into a visitor-facing page.
 *
 * @param string $medium Where the click came from (utm_medium).
 * @param string $path   Site-relative path, e.g. '/app'.
 * @return string
 */
function bicr_site_url( $medium, $path = '/' ) {
	return add_query_arg(
		array(
			'utm_source' => 'wp-plugin',
			'utm_medium' => rawurlencode( $medium ),
		),
		'https://imageresizer.cc' . $path
	);
}

/**
 * Add a "Settings" link on the plugins list row for quick access.
 *
 * @param array $links Existing action links.
 * @return array
 */
function bicr_plugin_action_links( $links ) {
	$url      = admin_url( 'admin.php?page=imreso-target-size-image-compressor' );
	$settings = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'imreso-target-size-image-compressor' ) . '</a>';
	array_unshift( $links, $settings );
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'bicr_plugin_action_links' );

/**
 * Extra links under our own row on the Plugins screen. Admin-only and shown just
 * for this plugin, which is the conventional, guideline-friendly place to point
 * at the project site and the support forum.
 *
 * @param string[] $links Existing row meta links.
 * @param string   $file  Plugin file the row belongs to.
 * @return string[]
 */
function bicr_plugin_row_meta( $links, $file ) {
	if ( plugin_basename( BICR_FILE ) !== $file ) {
		return $links;
	}
	$links[] = sprintf(
		'<a href="%s" target="_blank" rel="noopener">%s</a>',
		esc_url( bicr_site_url( 'row-meta', '/' ) ),
		esc_html__( 'Free online image resizer', 'imreso-target-size-image-compressor' )
	);
	$links[] = sprintf(
		'<a href="%s" target="_blank" rel="noopener">%s</a>',
		esc_url( 'https://wordpress.org/support/plugin/imreso-target-size-image-compressor/' ),
		esc_html__( 'Support', 'imreso-target-size-image-compressor' )
	);
	return $links;
}
add_filter( 'plugin_row_meta', 'bicr_plugin_row_meta', 10, 2 );

/**
 * Replace the admin footer credit on our own settings screen only. Every other
 * admin page keeps WordPress's default text untouched.
 *
 * @param string $text Existing footer text.
 * @return string
 */
function bicr_admin_footer_text( $text ) {
	if ( ! function_exists( 'get_current_screen' ) ) {
		return $text;
	}
	$screen = get_current_screen();
	if ( ! $screen || 'toplevel_page_' . BICR_Settings::PAGE !== $screen->id ) {
		return $text;
	}

	$link = sprintf(
		'<a href="%s" target="_blank" rel="noopener">%s</a>',
		esc_url( bicr_site_url( 'admin-footer' ) ),
		esc_html( 'ImageResizer.cc' )
	);
	$html = sprintf(
		/* translators: %s: ImageResizer.cc link. */
		esc_html__( 'Free, private, in-browser image compression by %s.', 'imreso-target-size-image-compressor' ),
		$link
	);
	return wp_kses( $html, array( 'a' => array( 'href' => array(), 'target' => array(), 'rel' => array() ) ) );
}
add_filter( 'admin_footer_text', 'bicr_admin_footer_text' );

/**
 * Seed default options on activation so the settings page and BICR_CFG have sane
 * values before the user ever visits the settings screen.
 */
function bicr_activate() {
	/*
	 * Migrate (and stamp the version) BEFORE seeding defaults. Activation can
	 * follow a plain deactivate/reactivate of 1.0.8, whose `ir_`-prefixed data is
	 * still in the database — stamping the version first would make
	 * bicr_maybe_upgrade() skip the migration forever and orphan the user's
	 * settings. Seeding afterwards is safe: add_option() no-ops on keys the
	 * migration has already restored.
	 */
	bicr_maybe_upgrade();

	add_option( 'bicr_enabled', 1 );
	add_option( 'bicr_format', 'webp' );
	add_option( 'bicr_target_kb', 500 );
	add_option( 'bicr_maxdim', 1920 );
	add_option( 'bicr_quality', 72 );
}
register_activation_hook( __FILE__, 'bicr_activate' );
