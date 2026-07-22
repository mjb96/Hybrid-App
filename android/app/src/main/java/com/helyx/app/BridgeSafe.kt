package com.helyx.app

/**
 * The ONE place that turns native values into JavaScript for
 * `WebView.evaluateJavascript(...)`. Every bridge that resolves a JS callback
 * (GPS, notifications, Health Connect, file export, automatic backup) MUST build its script here
 * so escaping can never drift between bridges.
 *
 * Two boundaries are guarded:
 *   1. the caller-supplied `callbackId`, echoed into the script — accepted only
 *      from a conservative alphabet (anything else is rejected, not escaped);
 *   2. the payload value — emitted as a fully-escaped JS string literal so no
 *      byte in it (quotes, backslashes, control chars, U+2028/U+2029 line/para
 *      separators) can terminate the literal or inject script.
 *
 * The web layer always generates ids from this same alphabet (see
 * tests/bridge_input.test.js), so valid calls are never affected.
 */
object BridgeSafe {
    private val CALLBACK_ID = Regex("^[A-Za-z0-9_-]{1,64}$")
    private val REGISTRY = Regex("^__[A-Za-z0-9]+$")

    /** Returns the id if it is safe to interpolate into a JS string, else null. */
    fun callbackId(raw: String?): String? =
        if (raw != null && CALLBACK_ID.matches(raw)) raw else null

    /**
     * Encode an arbitrary value as a fully-quoted, safely-escaped JS string
     * literal (double-quoted). This is the single escaping primitive; do not
     * hand-roll `replace(...)` chains at call sites.
     */
    fun javascriptString(value: String): String = buildString {
        append('"')
        value.forEach { char ->
            when (char) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                '\b' -> append("\\b")
                '\u000C' -> append("\\f")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                '\u2028', '\u2029' -> append("\\u%04x".format(char.code))
                else -> if (char.code < 0x20) append("\\u%04x".format(char.code)) else append(char)
            }
        }
        append('"')
    }

    /**
     * Build the canonical "resolve then delete a one-shot callback" script:
     *   if(window.<registry>&&window.<registry>['<id>'])
     *   {window.<registry>['<id>'](<payload>);delete window.<registry>['<id>'];}
     * The id is validated and the payload is JS-escaped. Returns null when the
     * id (or registry) is unsafe — the caller must then no-op rather than emit
     * anything.
     *
     * `registry` is always a fixed internal literal (e.g. "__hcCB"); it is
     * validated defensively so a future caller cannot pass user input here.
     */
    fun callbackScript(registry: String, callbackId: String?, payload: String): String? {
        if (!REGISTRY.matches(registry)) return null
        val safeId = callbackId(callbackId) ?: return null
        val quoted = javascriptString(payload)
        return "if(window.$registry&&window.$registry['$safeId'])" +
            "{window.$registry['$safeId']($quoted);delete window.$registry['$safeId'];}"
    }
}
