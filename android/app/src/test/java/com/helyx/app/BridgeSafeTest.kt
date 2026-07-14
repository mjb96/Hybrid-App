package com.helyx.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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

    // ── javascriptString: the single escaping primitive ──────────────────────

    @Test
    fun javascriptStringWrapsInDoubleQuotesAndEscapesSpecials() {
        assertEquals("\"plain\"", BridgeSafe.javascriptString("plain"))
        assertEquals("\"a\\\"b\"", BridgeSafe.javascriptString("a\"b"))       // " escaped
        assertEquals("\"a\\\\b\"", BridgeSafe.javascriptString("a\\b"))       // \ escaped
        assertEquals("\"a\\nb\"", BridgeSafe.javascriptString("a\nb"))        // newline
        assertEquals("\"a\\tb\"", BridgeSafe.javascriptString("a\tb"))        // tab
        // Single quotes are NOT escaped (payload is double-quoted) — proves we no
        // longer depend on single-quote wrapping the way the old ad-hoc code did.
        assertEquals("\"it's\"", BridgeSafe.javascriptString("it's"))
    }

    @Test
    fun javascriptStringEscapesLineAndParagraphSeparatorsAndControls() {
        // U+2028 / U+2029 terminate a JS string literal if left raw -- must be \u-escaped.
        assertEquals("\"\\u2028\"", BridgeSafe.javascriptString("\u2028"))
        assertEquals("\"\\u2029\"", BridgeSafe.javascriptString("\u2029"))
        assertEquals("\"\\u0000\"", BridgeSafe.javascriptString("\u0000"))
        assertEquals("\"\\u001f\"", BridgeSafe.javascriptString("\u001F"))
    }

    // ── callbackScript: the one script builder every bridge uses ─────────────

    @Test
    fun callbackScriptBuildsResolveAndDeleteForValidId() {
        val script = BridgeSafe.callbackScript("__hcCB", "cb_1_123", "{\"days\":[]}")
        assertNotNull(script)
        assertTrue(script!!.startsWith("if(window.__hcCB&&window.__hcCB['cb_1_123'])"))
        assertTrue(script.contains("delete window.__hcCB['cb_1_123'];"))
        // Payload's inner double-quotes are escaped inside the JS string literal.
        assertTrue(script.contains("(\"{\\\"days\\\":[]}\")"))
    }

    @Test
    fun callbackScriptRejectsHostileIdOrRegistry() {
        assertNull(BridgeSafe.callbackScript("__hcCB", "x'];alert(1)//", "{}"))
        assertNull(BridgeSafe.callbackScript("__hcCB", "a b", "{}"))
        assertNull(BridgeSafe.callbackScript("__hcCB", null, "{}"))
        // registry is always an internal literal; anything else is refused.
        assertNull(BridgeSafe.callbackScript("__x'];alert(1)//", "cb_1", "{}"))
        assertNull(BridgeSafe.callbackScript("window", "cb_1", "{}"))
    }

    @Test
    fun callbackScriptEscapesPayloadSoItCannotBreakOut() {
        // The literal is double-quoted, so the breakout risk is an unescaped " —
        // this payload tries to close the argument and inject a call.
        val payload = "\");alert(1);(\""
        val script = BridgeSafe.callbackScript("__gpsCB", "cb_9", payload)!!
        val expectedArg = BridgeSafe.javascriptString(payload)
        // callbackScript embeds exactly the escaped literal as the call argument.
        assertTrue(script.contains("(" + expectedArg + ")"))
        // Every payload " is backslash-escaped, so none can terminate the argument.
        assertTrue(expectedArg.contains("\\\""))
        assertFalse(expectedArg.substring(1, expectedArg.length - 1).contains("\";"))
    }
}
