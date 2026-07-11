package com.helyx.app

/**
 * Input validation for values crossing the JavaScript → native → JavaScript
 * boundary. The bridges echo a caller-supplied `callbackId` back into
 * `WebView.evaluateJavascript(...)`; interpolating an unsanitised id into that
 * JS string would be a script-injection vector. We therefore accept only a
 * conservative id alphabet and reject anything else.
 *
 * The web layer always generates ids from this same alphabet (see
 * tests/bridge_input.test.js), so valid calls are never affected.
 */
object BridgeSafe {
    private val CALLBACK_ID = Regex("^[A-Za-z0-9_-]{1,64}$")

    /** Returns the id if it is safe to interpolate into a JS string, else null. */
    fun callbackId(raw: String?): String? =
        if (raw != null && CALLBACK_ID.matches(raw)) raw else null
}
