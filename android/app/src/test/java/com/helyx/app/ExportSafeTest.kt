package com.helyx.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ExportSafeTest {
    @Test
    fun acceptsSupportedTextExports() {
        for ((name, mime) in listOf(
            "helyx-training-2026-07-14.json" to "application/json",
            "helyx-data-export.csv" to "text/csv",
            "notes.txt" to "text/plain",
        )) {
            val request = ExportSafe.request(name, "content", mime, "file_123")
            assertNotNull(request)
            assertEquals(name, request?.filename)
            assertEquals("file_123", request?.callbackId)
        }
    }

    @Test
    fun rejectsTraversalUnsupportedMimeAndHostileCallback() {
        assertNull(ExportSafe.request("../secret.json", "{}", "application/json", "file_1"))
        assertNull(ExportSafe.request("safe.html", "x", "text/html", "file_1"))
        assertNull(ExportSafe.request("safe.json", "{}", "application/json", "x'];alert(1)//"))
    }

    @Test
    fun callbackScriptQuotesPayloadAndRejectsHostileId() {
        val script = ExportSafe.callbackScript("file_123", "{\"message\":\"it's safe\"}")
        assertNotNull(script)
        assertTrue(script!!.contains("window.__fileExportCB['file_123']"))
        assertTrue(script.contains("it\\'s safe") || script.contains("it's safe"))
        assertNull(ExportSafe.callbackScript("x'];alert(1)//", "{}"))
    }
}
