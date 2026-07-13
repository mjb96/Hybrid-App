package com.helyx.app

import java.net.URI
import java.util.Locale

/**
 * Single source of truth for "is this URL the exact privileged app origin?".
 *
 * The app runs entirely from https://appassets.androidplatform.net/assets/www/,
 * served locally by WebViewAssetLoader. Everything that grants a capability the
 * open web must never have — staying inside the bridged WebView, being handed a
 * geolocation permission, reaching the native JavaScript bridges — must gate on
 * THIS check, not on a string prefix.
 *
 * A prefix test like `url.startsWith("https://appassets.androidplatform.net")`
 * is unsafe: it also matches lookalike authorities such as
 *   https://appassets.androidplatform.net.attacker.example/
 *   https://appassets.androidplatform.net@attacker.example/
 * both of which are a DIFFERENT origin. We therefore parse the URL and compare
 * scheme / host / port / user-info exactly.
 *
 * Pure Kotlin (no Android dependencies) so it is unit-testable on the plain JVM
 * — see TrustedOriginTest.
 */
object TrustedOrigin {
    const val SCHEME = "https"
    const val HOST = "appassets.androidplatform.net"

    /**
     * True only for the exact intended application origin:
     *  - scheme is exactly https (case-insensitive per RFC 3986),
     *  - host is exactly appassets.androidplatform.net (case-insensitive),
     *  - no user-info component (`user:pass@`),
     *  - port is absent or the https default (443).
     *
     * Any parse failure, malformed authority, or percent-encoded host that a
     * strict parser cannot resolve to the exact host returns false (fail-closed).
     */
    fun isTrusted(rawUrl: String?): Boolean {
        if (rawUrl.isNullOrEmpty()) return false

        val uri = try {
            URI(rawUrl)
        } catch (_: Exception) {
            return false
        }

        // Opaque URIs (e.g. "mailto:x", "javascript:...") have no authority.
        if (uri.isOpaque) return false

        val scheme = uri.scheme ?: return false
        if (!scheme.equals(SCHEME, ignoreCase = true)) return false

        // Reject any user-info — https://user@appassets.androidplatform.net/ is
        // NOT our origin. Check both raw and decoded forms.
        if (uri.userInfo != null || uri.rawUserInfo != null) return false

        // getHost() returns null when the authority is not a strictly valid host
        // (percent-encoding, illegal characters, embedded credentials, …). A null
        // host is therefore a rejection, which is exactly what we want.
        val host = uri.host ?: return false
        if (!host.equals(HOST, ignoreCase = true)) return false

        // Port must be absent (-1) or the https default. A custom port is a
        // different origin.
        if (uri.port != -1 && uri.port != 443) return false

        return true
    }

    /** Locale-stable lower-cased scheme, or null. Helper for external-link handling. */
    fun schemeOf(rawUrl: String?): String? {
        if (rawUrl.isNullOrEmpty()) return null
        val uri = try { URI(rawUrl) } catch (_: Exception) { return null }
        return uri.scheme?.lowercase(Locale.ROOT)
    }
}
