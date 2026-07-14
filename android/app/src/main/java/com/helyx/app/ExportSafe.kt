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

    /** Delegates to the one shared escaping API (BridgeSafe) — no local escaping. */
    fun callbackScript(callbackId: String?, payload: String): String? =
        BridgeSafe.callbackScript("__fileExportCB", callbackId, payload)
}
