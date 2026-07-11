package com.helyx.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Verifies the JS→native→JS callback-id sanitiser used by the WebView bridges.
 * A malformed id must be rejected (returns null) rather than interpolated into
 * evaluateJavascript(), which would be a script-injection vector. Mirrors the
 * web-side generator contract proven in tests/bridge_input.test.js.
 */
class BridgeSafeTest {

    @Test
    fun acceptsWellFormedIds() {
        for (id in listOf("perm_abc123", "n_1a2b3c", "A-Z_0-9", "x".repeat(64))) {
            assertEquals(id, BridgeSafe.callbackId(id))
        }
    }

    @Test
    fun rejectsInjectionShapedIds() {
        for (bad in listOf(
            "a');alert(1);//",
            "a b",
            "a\"b",
            "a;b",
            "",
            "x".repeat(65),
            "'+document.cookie+'",
            null,
        )) {
            assertNull("should reject: $bad", BridgeSafe.callbackId(bad))
        }
    }
}
