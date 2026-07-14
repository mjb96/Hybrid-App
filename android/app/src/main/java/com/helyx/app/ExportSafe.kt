package com.helyx.app

/** Pure validation/escaping at the privileged text-export bridge boundary. */
object ExportSafe {
    const val MAX_CONTENT_BYTES = 100 * 1024 * 1024
    private val FILENAME = Regex("^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$")
    private val MIME_TYPES = setOf("application/json", "text/csv", "text/plain")

    data class Request(
        val filename: String,
        val content: String,
        val mime: String,
        val callbackId: String?,
    )

    fun request(filename: String?, content: String?, mime: String?, callbackId: String?): Request? {
        val safeName = filename?.trim()?.takeIf { FILENAME.matches(it) } ?: return null
        val safeMime = mime?.trim()?.takeIf { it in MIME_TYPES } ?: return null
        val safeContent = content ?: return null
        if (safeContent.toByteArray(Charsets.UTF_8).size > MAX_CONTENT_BYTES) return null
        val safeCallback = callbackId?.let { BridgeSafe.callbackId(it) ?: return null }
        return Request(safeName, safeContent, safeMime, safeCallback)
    }

    fun callbackScript(callbackId: String?, payload: String): String? {
        val safe = BridgeSafe.callbackId(callbackId) ?: return null
        val quotedPayload = javascriptString(payload)
        return "if(window.__fileExportCB&&window.__fileExportCB['$safe'])" +
            "{window.__fileExportCB['$safe']($quotedPayload);delete window.__fileExportCB['$safe'];}"
    }

    private fun javascriptString(value: String): String = buildString {
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
}
