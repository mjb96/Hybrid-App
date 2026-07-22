package com.helyx.app

/**
 * Converts HTML file-input accept filters into MIME types understood by
 * Android's ACTION_OPEN_DOCUMENT contract.
 *
 * WebView can surface extension tokens such as `.json` and `.fit`, but
 * ActivityResultContracts.OpenDocument accepts MIME types only. Unknown
 * extensions fail open to the picker; the web importers still validate the
 * selected file contents before changing any app data.
 */
object FileChooserTypes {
    private val MIME_TYPE = Regex("^[a-z0-9!#$&^_.+*-]+/[a-z0-9!#$&^_.+*-]+$")

    fun normalize(rawTypes: Array<out String>?): Array<String> {
        val normalized = mutableListOf<String>()
        var unknownExtension = false

        rawTypes.orEmpty()
            .flatMap { it.split(',') }
            .map { it.trim().lowercase() }
            .filter { it.isNotEmpty() }
            .forEach { token ->
                when (token) {
                    ".json" -> normalized += "application/json"
                    ".fit" -> normalized += listOf(
                        "application/vnd.ant.fit",
                        "application/octet-stream",
                    )
                    else -> when {
                        token.startsWith('.') -> unknownExtension = true
                        MIME_TYPE.matches(token) -> normalized += token
                    }
                }
            }

        if (unknownExtension || normalized.isEmpty()) return arrayOf("*/*")
        return normalized.distinct().toTypedArray()
    }
}
