package com.helyx.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Exact-origin validation for the privileged WebView. These cover the cases the
 * old `url.startsWith(APP_ORIGIN)` prefix check got wrong (lookalike hosts,
 * embedded credentials, http downgrade) plus the valid navigations that must
 * still be trusted.
 *
 * Pure JVM test — TrustedOrigin has no Android dependencies.
 */
class TrustedOriginTest {

    @Test
    fun acceptsExactAppOrigin() {
        for (url in listOf(
            "https://appassets.androidplatform.net/assets/www/index.html",
            "https://appassets.androidplatform.net/",
            "https://appassets.androidplatform.net/assets/www/index.html#home",
            "https://appassets.androidplatform.net/assets/www/index.html?tab=analytics",
            "https://appassets.androidplatform.net:443/assets/www/index.html", // explicit default port
            "HTTPS://APPASSETS.ANDROIDPLATFORM.NET/assets/", // scheme+host are case-insensitive
        )) {
            assertTrue("should trust: $url", TrustedOrigin.isTrusted(url))
        }
    }

    @Test
    fun rejectsLookalikeHosts() {
        for (url in listOf(
            "https://appassets.androidplatform.net.attacker.example/assets/www/index.html",
            "https://appassets.androidplatform.net.evil.co/",
            "https://evil-appassets.androidplatform.net/",
            "https://appassets.androidplatform.example/",
            "https://androidplatform.net/",
        )) {
            assertFalse("should reject lookalike: $url", TrustedOrigin.isTrusted(url))
        }
    }

    @Test
    fun rejectsEmbeddedCredentials() {
        for (url in listOf(
            "https://appassets.androidplatform.net@attacker.example/",
            "https://user@appassets.androidplatform.net/",
            "https://user:pass@appassets.androidplatform.net/assets/",
        )) {
            assertFalse("should reject userinfo: $url", TrustedOrigin.isTrusted(url))
        }
    }

    @Test
    fun rejectsWrongScheme() {
        for (url in listOf(
            "http://appassets.androidplatform.net/assets/www/index.html",
            "ftp://appassets.androidplatform.net/",
            "file:///android_asset/www/index.html",
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
        )) {
            assertFalse("should reject scheme: $url", TrustedOrigin.isTrusted(url))
        }
    }

    @Test
    fun rejectsWrongPort() {
        for (url in listOf(
            "https://appassets.androidplatform.net:8080/assets/",
            "https://appassets.androidplatform.net:80/assets/",
        )) {
            assertFalse("should reject port: $url", TrustedOrigin.isTrusted(url))
        }
    }

    @Test
    fun rejectsMalformedAndEmpty() {
        for (url in listOf(
            null,
            "",
            "   ",
            "not a url",
            "https://",
            "//appassets.androidplatform.net/",           // scheme-relative, no scheme
            "/assets/www/index.html",                      // path only
            "https://appassets%2eandroidplatform.net/",   // percent-encoded host
        )) {
            assertFalse("should reject malformed: $url", TrustedOrigin.isTrusted(url))
        }
    }

    @Test
    fun schemeOfIsLowercasedOrNull() {
        assertTrue("https" == TrustedOrigin.schemeOf("HTTPS://appassets.androidplatform.net/"))
        assertTrue("http" == TrustedOrigin.schemeOf("http://example.com/"))
        assertTrue("mailto" == TrustedOrigin.schemeOf("mailto:a@b.com"))
        assertTrue(null == TrustedOrigin.schemeOf("not a url with space"))
    }
}
