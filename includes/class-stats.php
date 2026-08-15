<?php
/**
 * Savings tracking + visibility. The browser reports each image's original and
 * optimized size after upload (admin-ajax); we store it as attachment meta
 * (`_bicr_saved`) and bump an aggregate option (`bicr_stats`). The numbers surface
 * in three places: the Media Library "Optimized" column, the attachment details
 * panel, and the aggregate line on Settings → Media.
 *
 * @package ImReso
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class BICR_Stats
 */
class BICR_Stats {

	/**
	 * Hook AJAX + the admin display surfaces.
	 */
	public function register() {
		add_action( 'wp_ajax_bicr_record', array( $this, 'ajax_record' ) );
		add_filter( 'attachment_fields_to_edit', array( $this, 'attachment_field' ), 10, 2 );
		add_filter( 'manage_media_columns', array( $this, 'media_column' ) );
		add_action( 'manage_media_custom_column', array( $this, 'media_column_value' ), 10, 2 );
	}

	/**
	 * AJAX: store a single attachment's savings and update the aggregate.
	 */
	public function ajax_record() {
		check_ajax_referer( 'bicr_record' );

		if ( ! current_user_can( 'upload_files' ) ) {
			wp_send_json_error( 'forbidden', 403 );
		}

		$id        = isset( $_POST['attachment_id'] ) ? absint( $_POST['attachment_id'] ) : 0;
		$original  = isset( $_POST['original'] ) ? (int) $_POST['original'] : 0;
		$optimized = isset( $_POST['optimized'] ) ? (int) $_POST['optimized'] : 0;

		if ( ! $id || $original <= 0 || $optimized <= 0 || $optimized > $original ) {
			wp_send_json_error( 'invalid' );
		}

		// Store once per attachment (ignore duplicate reports).
		if ( get_post_meta( $id, '_bicr_saved', true ) ) {
			wp_send_json_success( 'already' );
		}

		update_post_meta( $id, '_bicr_saved', array( 'original' => $original, 'optimized' => $optimized ) );

		$stats = $this->get_stats();
		$stats['count']     += 1;
		$stats['original']  += $original;
		$stats['optimized'] += $optimized;
		update_option( 'bicr_stats', $stats, false );

		wp_send_json_success();
	}

	/**
	 * Aggregate stats with safe defaults.
	 *
	 * @return array{count:int,original:int,optimized:int}
	 */
	public function get_stats() {
		$stats = get_option( 'bicr_stats', array() );
		return array(
			'count'     => isset( $stats['count'] ) ? (int) $stats['count'] : 0,
			'original'  => isset( $stats['original'] ) ? (int) $stats['original'] : 0,
			'optimized' => isset( $stats['optimized'] ) ? (int) $stats['optimized'] : 0,
		);
	}

	/**
	 * "Optimized" column in the Media Library list view.
	 *
	 * @param array $cols Columns.
	 * @return array
	 */
	public function media_column( $cols ) {
		$cols['bicr_saved'] = __( 'Optimized', 'imreso-target-size-image-compressor' );
		return $cols;
	}

	/**
	 * Render the column value: the percent saved, or a dash.
	 *
	 * @param string $col Column name.
	 * @param int    $id  Attachment ID.
	 */
	public function media_column_value( $col, $id ) {
		if ( 'bicr_saved' !== $col ) {
			return;
		}
		$pct = $this->percent( $id );
		echo esc_html( null === $pct ? '—' : '−' . $pct . '%' );
	}

	/**
	 * Read-only savings line in the attachment details panel.
	 *
	 * @param array   $fields Form fields.
	 * @param WP_Post $post   Attachment post.
	 * @return array
	 */
	public function attachment_field( $fields, $post ) {
		$s = get_post_meta( $post->ID, '_bicr_saved', true );
		if ( is_array( $s ) && ! empty( $s['original'] ) ) {
			$pct          = (int) round( ( 1 - $s['optimized'] / $s['original'] ) * 100 );
			$fields['bicr_saved'] = array(
				'label' => __( 'ImReso', 'imreso-target-size-image-compressor' ),
				'input' => 'html',
				'html'  => esc_html(
					sprintf(
						/* translators: 1: percent saved, 2: original size, 3: optimized size. */
						__( 'Saved %1$s%% (%2$s → %3$s)', 'imreso-target-size-image-compressor' ),
						$pct,
						size_format( $s['original'] ),
						size_format( $s['optimized'] )
					)
				),
			);
		}
		return $fields;
	}

	/**
	 * Percent saved for an attachment, or null when not optimized.
	 *
	 * @param int $id Attachment ID.
	 * @return int|null
	 */
	private function percent( $id ) {
		$s = get_post_meta( $id, '_bicr_saved', true );
		if ( ! is_array( $s ) || empty( $s['original'] ) ) {
			return null;
		}
		return (int) round( ( 1 - $s['optimized'] / $s['original'] ) * 100 );
	}
}
