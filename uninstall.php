<?php
/**
 * Uninstall cleanup: remove every option the plugin created. Runs only when the
 * user deletes the plugin from the Plugins screen.
 *
 * @package ImReso
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

$bicr_options = array(
	'bicr_enabled',
	'bicr_format',
	'bicr_target_kb',
	'bicr_quality',
	'bicr_maxdim',
	'bicr_powered_by',
	'bicr_stats',
	'bicr_version',
	// Legacy `ir_` names from <= 1.0.8, in case the migration never ran.
	'ir_enabled',
	'ir_format',
	'ir_target_kb',
	'ir_quality',
	'ir_maxdim',
	'ir_powered_by',
	'ir_stats',
);

/**
 * Remove all plugin options + the per-attachment savings meta for the current site.
 *
 * @param string[] $bicr_options Option names to delete.
 */
function bicr_uninstall_site( $bicr_options ) {
	foreach ( $bicr_options as $bicr_option ) {
		delete_option( $bicr_option );
	}
	// Delete for every attachment, under both the current and the legacy key.
	delete_metadata( 'post', 0, '_bicr_saved', '', true );
	delete_metadata( 'post', 0, '_ir_saved', '', true );
}

bicr_uninstall_site( $bicr_options );

// Multisite: clean each site too.
if ( is_multisite() ) {
	$bicr_sites = get_sites( array( 'fields' => 'ids', 'number' => 0 ) );
	foreach ( $bicr_sites as $bicr_site_id ) {
		switch_to_blog( $bicr_site_id );
		bicr_uninstall_site( $bicr_options );
		restore_current_blog();
	}
}
