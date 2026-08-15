<?php
/**
 * Server-side sub-size quality. WordPress regenerates several thumbnail sizes
 * server-side (GD/Imagick) from the uploaded original. Our browser pass only
 * compresses the original, so we lower the quality WordPress uses for the
 * derived sizes via wp_editor_set_quality (JPEG/WebP/AVIF only — see quality()).
 *
 * Core passes a third `$dims` argument since WP 6.8; we register for two, which
 * is the documented way to opt out of the extra parameter.
 *
 * @package ImReso
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class BICR_Subsizes
 */
class BICR_Subsizes {

	/**
	 * Hook the quality filter when enabled.
	 */
	public function register() {
		if ( ! (int) get_option( 'bicr_enabled', 1 ) ) {
			return;
		}
		add_filter( 'wp_editor_set_quality', array( $this, 'quality' ), 10, 2 );
	}

	/**
	 * Lossy formats where the number really is a visual quality, and where our
	 * browser pass already applied the user's setting to the original.
	 */
	const LOSSY_MIMES = array( 'image/jpeg', 'image/webp', 'image/avif' );

	/**
	 * Use the configured quality (clamped) for server-generated sub-sizes, but
	 * only for the lossy formats above. For PNG and GIF the editors treat this
	 * number as a zlib compression level rather than a visual quality, so we
	 * leave WordPress's own default alone instead of forcing our value onto it.
	 *
	 * @param int    $quality Default quality WordPress would use.
	 * @param string $mime    Target (output) MIME type.
	 * @return int
	 */
	public function quality( $quality, $mime = '' ) {
		if ( '' !== $mime && ! in_array( $mime, self::LOSSY_MIMES, true ) ) {
			return $quality;
		}
		$q = (int) get_option( 'bicr_quality', 72 );
		return max( 1, min( 100, $q ) );
	}
}
