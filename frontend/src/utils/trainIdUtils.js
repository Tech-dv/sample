/**
 * Utility functions for encoding/decoding train IDs in URL parameters.
 *
 * Train IDs (rake_serial_number) are stored in the DB and displayed as:
 *   e.g.  2025-26/02/001
 *
 * In URL paths, forward slashes would create extra path segments and cause
 * 404 errors.  We therefore replace "/" with "_" in URL params only:
 *   e.g.  2025-26_02_001
 *
 * The DB value and all display labels remain unchanged.
 */

/**
 * Convert a train ID to a URL-safe param (replaces "/" with "_").
 * @param {string} id  – e.g. "2025-26/02/001"
 * @returns {string}   – e.g. "2025-26_02_001"
 */
export function idToUrlParam(id) {
    if (!id) return id;
    return id.replace(/\//g, '_');
}

/**
 * Convert a URL param back to the original train ID (replaces "_" with "/").
 * This is the inverse of idToUrlParam.
 *
 * NOTE: underscores in the *year* segment (e.g. "2025-26") are part of the
 * real ID, but there are no underscores in financial-year IDs – the separator
 * between year/month/sequence is always a slash.  So a simple global replace
 * of "_" → "/" is safe here.
 * @param {string} param – e.g. "2025-26_02_001"
 * @returns {string}     – e.g. "2025-26/02/001"
 */
export function urlParamToId(param) {
    if (!param) return param;
    return param.replace(/_/g, '/');
}
