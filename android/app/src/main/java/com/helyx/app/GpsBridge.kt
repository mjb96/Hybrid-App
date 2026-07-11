package com.helyx.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicReference

/**
 * Android JavascriptInterface injected as `window.HybridGpsBridge`.
 *
 * Gives the web run-tracker a GPS source that survives screen lock and app
 * switches by delegating collection to GpsTrackingService (a location
 * foreground service) and letting JS pull buffered fixes when it is awake.
 *
 * JS contract (all synchronous unless noted):
 *   hasLocationPermission()          → Boolean
 *   requestLocationPermission(cbId)  → void; resolves window.__gpsCB[cbId]('true'|'false')
 *   startRun()                       → Boolean (false = no permission, use web fallback)
 *   pauseRun() / resumeRun() / stopRun()
 *   getPointsSince(seq)              → JSON string:
 *       { seq, status: "IDLE"|"TRACKING"|"PAUSED", elapsedMs, points: [[lat,lng,acc,t],…] }
 *     `seq` is the cursor to pass next call. Passing 0 replays the whole run —
 *     that is how a relaunched WebView recovers an in-flight run.
 */
class GpsBridge(
    private val context: Context,
    private val webView: WebView,
    private val requestLocationPermission: () -> Unit,
) {
    private val pendingPermCallbackId = AtomicReference<String?>()

    @JavascriptInterface
    fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    @JavascriptInterface
    fun requestLocationPermission(callbackId: String) {
        // Validate the id before it is ever echoed into evaluateJavascript.
        val safeId = BridgeSafe.callbackId(callbackId) ?: return
        if (hasLocationPermission()) { resolvePermCallback(safeId, true); return }
        pendingPermCallbackId.set(safeId)
        webView.post { requestLocationPermission.invoke() }
    }

    /** Called by MainActivity when the OS permission dialog resolves. */
    fun onPermissionResult(granted: Boolean) {
        val id = pendingPermCallbackId.getAndSet(null) ?: return
        resolvePermCallback(id, granted)
    }

    @JavascriptInterface
    fun startRun(): Boolean {
        if (!hasLocationPermission()) return false
        command(GpsTrackingService.ACTION_START, foreground = true)
        return true
    }

    @JavascriptInterface
    fun pauseRun() = command(GpsTrackingService.ACTION_PAUSE)

    @JavascriptInterface
    fun resumeRun() = command(GpsTrackingService.ACTION_RESUME)

    @JavascriptInterface
    fun stopRun() = command(GpsTrackingService.ACTION_STOP)

    @JavascriptInterface
    fun getPointsSince(seq: Int): String = GpsPointStore.drainJson(seq)

    // ── Internal ─────────────────────────────────────────────────────────────

    private fun command(action: String, foreground: Boolean = false) {
        val intent = Intent(context, GpsTrackingService::class.java).apply { this.action = action }
        // START must go through startForegroundService (API 26+); control
        // actions reach the already-running service with plain startService.
        if (foreground) context.startForegroundService(intent) else context.startService(intent)
    }

    private fun resolvePermCallback(id: String, granted: Boolean) {
        // id is already validated (BridgeSafe.callbackId); guard again so no
        // future caller can bypass sanitisation.
        val safe = BridgeSafe.callbackId(id) ?: return
        webView.post {
            webView.evaluateJavascript(
                "if(window.__gpsCB&&window.__gpsCB['$safe'])" +
                "{window.__gpsCB['$safe']('$granted');delete window.__gpsCB['$safe'];}",
                null,
            )
        }
    }
}
