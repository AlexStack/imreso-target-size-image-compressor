<?php
/**
 * The plugin's top-level "Target-Size Image Compressor" admin page (Settings API). Combines
 * the controls (master toggle, output format, target size, max dimension,
 * quality), the running savings total, and a table of
 * recently optimized images so the before/after changes are visible in one place.
 *
 * @package ImReso
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class BICR_Settings
 */
class BICR_Settings {

	const GROUP   = 'bicr_settings';        // Our own settings group (saved via options.php).
	const PAGE    = 'imreso-target-size-image-compressor';  // Top-level admin page slug.
	const SECTION = 'bicr_optimizer';

	/**
	 * Register settings + the admin menu page.
	 */
	public function register() {
		add_action( 'admin_init', array( $this, 'init' ) );
		add_action( 'admin_menu', array( $this, 'add_page' ) );
	}

	/**
	 * Add the top-level menu page.
	 */
	public function add_page() {
		add_menu_page(
			__( 'ImReso', 'imreso-target-size-image-compressor' ),
			__( 'ImReso', 'imreso-target-size-image-compressor' ),
			'manage_options',
			self::PAGE,
			array( $this, 'render_page' ),
			'dashicons-images-alt2',
			81
		);
	}

	/**
	 * Settings API wiring.
	 */
	public function init() {
		register_setting( self::GROUP, 'bicr_enabled', array( 'type' => 'boolean', 'sanitize_callback' => array( $this, 'sanitize_bool' ), 'default' => 1 ) );
		register_setting( self::GROUP, 'bicr_format', array( 'type' => 'string', 'sanitize_callback' => array( $this, 'sanitize_format' ), 'default' => 'webp' ) );
		register_setting( self::GROUP, 'bicr_target_kb', array( 'type' => 'integer', 'sanitize_callback' => array( $this, 'sanitize_target_kb' ), 'default' => 500 ) );
		register_setting( self::GROUP, 'bicr_maxdim', array( 'type' => 'integer', 'sanitize_callback' => array( $this, 'sanitize_maxdim' ), 'default' => 1920 ) );
		register_setting( self::GROUP, 'bicr_quality', array( 'type' => 'integer', 'sanitize_callback' => array( $this, 'sanitize_quality' ), 'default' => 72 ) );

		add_settings_section(
			self::SECTION,
			'',
			array( $this, 'section_intro' ),
			self::PAGE
		);

		// Field order: enable, then output format, target size, max dimension,
		// quality (matches the website's control order).
		add_settings_field( 'bicr_enabled', __( 'Enable optimization', 'imreso-target-size-image-compressor' ), array( $this, 'field_enabled' ), self::PAGE, self::SECTION, array( 'label_for' => 'bicr_enabled' ) );
		add_settings_field( 'bicr_format', __( 'Output format', 'imreso-target-size-image-compressor' ), array( $this, 'field_format' ), self::PAGE, self::SECTION, array( 'label_for' => 'bicr_format' ) );
		add_settings_field( 'bicr_target_kb', __( 'Max compress size (KB)', 'imreso-target-size-image-compressor' ), array( $this, 'field_target_kb' ), self::PAGE, self::SECTION, array( 'label_for' => 'bicr_target_kb' ) );
		add_settings_field( 'bicr_maxdim', __( 'Max dimension (px)', 'imreso-target-size-image-compressor' ), array( $this, 'field_maxdim' ), self::PAGE, self::SECTION, array( 'label_for' => 'bicr_maxdim' ) );
		add_settings_field( 'bicr_quality', __( 'Quality', 'imreso-target-size-image-compressor' ), array( $this, 'field_quality' ), self::PAGE, self::SECTION, array( 'label_for' => 'bicr_quality' ) );
	}

	/* ----------------------------------------------------------------- *
	 * Sanitizers
	 * ----------------------------------------------------------------- */

	/**
	 * @param mixed $v Raw value.
	 * @return int 0|1
	 */
	public function sanitize_bool( $v ) {
		return $v ? 1 : 0;
	}

	/**
	 * @param mixed $v Raw value.
	 * @return string One of auto|jpeg|webp|avif.
	 */
	public function sanitize_format( $v ) {
		$v = is_string( $v ) ? $v : 'webp';
		return in_array( $v, array( 'auto', 'jpeg', 'webp', 'avif' ), true ) ? $v : 'webp';
	}

	/**
	 * @param mixed $v Raw value.
	 * @return int 1-100
	 */
	public function sanitize_quality( $v ) {
		return max( 1, min( 100, (int) $v ) );
	}

	/**
	 * Target output size in KB. 0 = off (fall back to the quality value).
	 *
	 * @param mixed $v Raw value.
	 * @return int 0 or 1-51200
	 */
	public function sanitize_target_kb( $v ) {
		$v = (int) $v;
		if ( $v <= 0 ) {
			return 0;
		}
		return max( 1, min( 51200, $v ) );
	}

	/**
	 * @param mixed $v Raw value.
	 * @return int 0 (unlimited) or >= 256
	 */
	public function sanitize_maxdim( $v ) {
		$v = (int) $v;
		if ( $v <= 0 ) {
			return 0;
		}
		return max( 256, min( 10000, $v ) );
	}

	/* ----------------------------------------------------------------- *
	 * Renderers
	 * ----------------------------------------------------------------- */

	/**
	 * Section intro / scope disclosure.
	 */
	public function section_intro() {
		echo '<a id="bicr-optimizer"></a>';
		echo '<p>' . esc_html__(
			'ImReso compresses and resizes your images right in your browser as you upload them — nothing is ever sent to an external server, so your photos stay private and your hosting does no work. It is free to use with no per-image limits or credits, and works in every modern browser, including Safari and iOS.',
			'imreso-target-size-image-compressor'
		) . '</p>';

		$link = sprintf(
			'<a href="%s" target="_blank" rel="noopener">%s</a>',
			esc_url( bicr_site_url( 'settings-intro' ) ),
			esc_html( 'ImageResizer.cc' )
		);
		$html = sprintf(
			/* translators: %s: link to ImageResizer.cc (opens in a new tab). */
			esc_html__( 'It uses almost the same engine as %s — the free online image resizer and compressor.', 'imreso-target-size-image-compressor' ),
			$link
		);
		echo '<p>' . wp_kses(
			$html,
			array( 'a' => array( 'href' => array(), 'target' => array(), 'rel' => array() ) )
		) . '</p>';

		// Aggregate savings so far (populated as images are optimized on upload).
		$stats = get_option( 'bicr_stats' );
		if ( is_array( $stats ) && ! empty( $stats['count'] ) && ! empty( $stats['original'] ) ) {
			$saved = max( 0, (int) $stats['original'] - (int) $stats['optimized'] );
			$pct   = (int) round( $saved / (int) $stats['original'] * 100 );
			echo '<p style="color:#008a20;font-weight:600;font-size:14px;">' . esc_html(
				sprintf(
					/* translators: 1: image count, 2: data saved (e.g. 5 MB), 3: percent saved. */
					__( '%1$s images compressed and resized — %2$s space saved (%3$s%%)', 'imreso-target-size-image-compressor' ),
					number_format_i18n( $stats['count'] ),
					size_format( $saved ),
					$pct
				)
			) . '</p>';
		}
	}

	/**
	 * Master toggle.
	 */
	public function field_enabled() {
		$v = (int) get_option( 'bicr_enabled', 1 );
		echo '<label><input type="checkbox" id="bicr_enabled" name="bicr_enabled" value="1" ' . checked( 1, $v, false ) . ' /> ';
		echo esc_html__( 'Compress new uploads in the browser', 'imreso-target-size-image-compressor' ) . '</label>';
	}

	/**
	 * Output format select.
	 */
	public function field_format() {
		$v       = (string) get_option( 'bicr_format', 'webp' );
		$options = array(
			'auto' => __( 'Auto (best per image)', 'imreso-target-size-image-compressor' ),
			'webp' => __( 'WebP', 'imreso-target-size-image-compressor' ),
			'avif' => __( 'AVIF (smallest, slower)', 'imreso-target-size-image-compressor' ),
			'jpeg' => __( 'JPEG', 'imreso-target-size-image-compressor' ),
		);
		echo '<select id="bicr_format" name="bicr_format">';
		foreach ( $options as $key => $label ) {
			echo '<option value="' . esc_attr( $key ) . '" ' . selected( $v, $key, false ) . '>' . esc_html( $label ) . '</option>';
		}
		echo '</select>';
		echo '<p class="description">' . esc_html__( 'Auto picks AVIF/WebP/JPEG per image. WebP is the safest default for older browsers.', 'imreso-target-size-image-compressor' ) . '</p>';
	}

	/**
	 * Quality number input.
	 */
	public function field_quality() {
		$v = (int) get_option( 'bicr_quality', 72 );
		echo '<input type="number" min="1" max="100" step="1" id="bicr_quality" name="bicr_quality" value="' . esc_attr( $v ) . '" class="small-text" /> ';
		echo '<span>' . esc_html__( '(1–100; lower = smaller files. 72 is a good default.)', 'imreso-target-size-image-compressor' ) . '</span>';
		echo '<p class="description">' . esc_html__( 'Also applied to the thumbnail sizes WordPress generates on the server.', 'imreso-target-size-image-compressor' ) . '</p>';
	}

	/**
	 * Expected (target) compressed size in KB. 0 = off → use the quality value.
	 */
	public function field_target_kb() {
		$v = (int) get_option( 'bicr_target_kb', 500 );
		echo '<input type="number" min="0" max="51200" step="1" id="bicr_target_kb" name="bicr_target_kb" value="' . esc_attr( $v ) . '" class="small-text" /> KB ';
		echo '<p class="description">' . esc_html__( '0 = off (use the Quality value below). Each image is expected to be compressed below this target size.', 'imreso-target-size-image-compressor' ) . '</p>';
	}

	/**
	 * Max dimension number input.
	 */
	public function field_maxdim() {
		$v = (int) get_option( 'bicr_maxdim', 1920 );
		echo '<input type="number" min="0" max="10000" step="1" id="bicr_maxdim" name="bicr_maxdim" value="' . esc_attr( $v ) . '" class="small-text" /> ';
		echo '<span>' . esc_html__( 'px (0 = no limit). Large photos are scaled down to this longest edge before compressing.', 'imreso-target-size-image-compressor' ) . '</span>';
	}

	/* ----------------------------------------------------------------- *
	 * Page
	 * ----------------------------------------------------------------- */

	/**
	 * Render the top-level admin page: settings form + recent optimizations.
	 */
	public function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		echo '<div class="wrap">';
		echo '<h1>' . esc_html__( 'ImReso', 'imreso-target-size-image-compressor' ) . '</h1>';

		// options.php stashes its own translated "Settings saved." notice in the
		// `settings_errors` transient on redirect; print it rather than shipping a
		// duplicate string under core's text domain.
		settings_errors();

		echo '<form method="post" action="options.php">';
		settings_fields( self::GROUP );
		do_settings_sections( self::PAGE );
		submit_button();
		echo '</form>';

		$this->render_recent();
		echo '</div>';
	}

	/**
	 * Table of recently optimized images (newest first), with before/after sizes.
	 */
	private function render_recent() {
		echo '<h2>' . esc_html__( 'Recent images compressed and resized', 'imreso-target-size-image-compressor' ) . '</h2>';

		// Deliberately NOT 'fields' => 'ids': that branch of WP_Query returns before
		// _prime_post_caches() runs, so the loop below would fire an uncached
		// get_post() + get_post_meta() per row. Asking for full objects primes the
		// post and postmeta caches once, for every row, in two queries.
		$query = new WP_Query(
			array(
				'post_type'              => 'attachment',
				'post_status'            => 'inherit',
				'posts_per_page'         => 50,
				'meta_key'               => '_bicr_saved', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'orderby'                => 'date',
				'order'                  => 'DESC',
				'no_found_rows'          => true,
				'update_post_meta_cache' => true,
				'update_post_term_cache' => false, // attachments carry no terms we render.
			)
		);

		if ( empty( $query->posts ) ) {
			echo '<p>' . esc_html__( 'No images optimized yet.', 'imreso-target-size-image-compressor' ) . '</p>';
			return;
		}

		echo '<table class="wp-list-table widefat fixed striped" style="max-width:760px">';
		echo '<thead><tr>';
		echo '<th style="width:56px"></th>';
		echo '<th>' . esc_html__( 'File', 'imreso-target-size-image-compressor' ) . '</th>';
		echo '<th>' . esc_html__( 'Original', 'imreso-target-size-image-compressor' ) . '</th>';
		echo '<th>' . esc_html__( 'Optimized', 'imreso-target-size-image-compressor' ) . '</th>';
		echo '<th>' . esc_html__( 'Saved', 'imreso-target-size-image-compressor' ) . '</th>';
		echo '<th>' . esc_html__( 'Date', 'imreso-target-size-image-compressor' ) . '</th>';
		echo '</tr></thead><tbody>';

		foreach ( $query->posts as $attachment ) {
			$id = $attachment->ID;
			$s  = get_post_meta( $id, '_bicr_saved', true );
			if ( ! is_array( $s ) || empty( $s['original'] ) ) {
				continue;
			}
			$pct = (int) round( ( 1 - $s['optimized'] / $s['original'] ) * 100 );

			// Null when the current user cannot edit this attachment; linking is a
			// convenience, so fall back to plain cells rather than an empty href.
			$edit  = get_edit_post_link( $id );
			$thumb = wp_get_attachment_image( $id, array( 44, 44 ) );
			$title = esc_html( get_the_title( $id ) );
			if ( $edit ) {
				$open  = '<a href="' . esc_url( $edit ) . '" target="_blank" rel="noopener">';
				$thumb = $open . $thumb . '</a>';
				$title = $open . $title . '</a>';
			}

			echo '<tr>';
			echo '<td>' . $thumb . '</td>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			echo '<td>' . $title . '</td>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			echo '<td>' . esc_html( size_format( $s['original'] ) ) . '</td>';
			echo '<td>' . esc_html( size_format( $s['optimized'] ) ) . '</td>';
			echo '<td><strong>' . esc_html( '−' . $pct . '%' ) . '</strong></td>';
			echo '<td>' . esc_html( get_the_date( '', $id ) ) . '</td>';
			echo '</tr>';
		}
		echo '</tbody></table>';
	}
}
