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
 *   pauseRun() / resumeRun() / stopRun() / completeRun() / discardRun()
 *   getPointsSince(seq)              → JSON string:
 *       { seq, status: "IDLE"|"TRACKING"|"PAUSED"|"FINALIZING"|"RECOVERY_ERROR",
 *         elapsedMs, durable, restored, points: [[lat,lng,acc,t],…] }
 *     `seq` is the cursor to pass next call. Passing 0 replays the whole run —
 *     that is how a relaunched WebView recovers an in-flight run.
 */
class GpsBridge(
    private val context: Context,
    private val webView: WebView,
    private val requestLocationPermission: () -> Unit,
) {
    private val pendingPermCallbackId = AtomicReference<String?>()

    init {
        GpsPointStore.initialize(context)
    }

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
        // Prepare the durable journal synchronously so JS never receives a successful
        // start while native persistence is unavailable. Also refuses to overwrite an
        // unfinalized run recovered from disk.
        if (!GpsPointStore.startRun()) return false
        return try {
            command(GpsTrackingService.ACTION_START, foreground = true)
            true
        } catch (_: RuntimeException) {
            GpsPointStore.clearRun()
            false
        }
    }

    @JavascriptInterface
    fun pauseRun(): Boolean {
        if (!GpsPointStore.pauseRun()) return false
        return try {
            command(GpsTrackingService.ACTION_PAUSE)
            true
        } catch (_: RuntimeException) {
            // JS keeps presenting a live run when dispatch fails, so restore the
            // store to TRACKING too. A failed rollback remains visibly PAUSED in
            // the next drain rather than creating split-brain state.
            GpsPointStore.resumeRun()
            false
        }
    }

    @JavascriptInterface
    fun resumeRun(): Boolean {
        if (!GpsPointStore.resumeRun()) return false
        return try {
            command(GpsTrackingService.ACTION_RESUME, foreground = true)
            true
        } catch (_: RuntimeException) {
            GpsPointStore.pauseRun()
            false
        }
    }

    @JavascriptInterface
    fun stopRun(): Boolean {
        if (!GpsPointStore.finalizeRun()) return false
        context.stopService(Intent(context, GpsTrackingService::class.java))
        return true
    }

    /** JS calls this only after route + app-state persistence completed. */
    @JavascriptInterface
    fun completeRun(): Boolean = GpsPointStore.clearRun()

    /** Explicit cancel: stop collection and remove the unsaved journal. */
    @JavascriptInterface
    fun discardRun(): Boolean {
        if (!GpsPointStore.clearRun()) return false
        context.stopService(Intent(context, GpsTrackingService::class.java))
        return true
    }

    @JavascriptInterface
    fun getPointsSince(seq: Int): String = GpsPointStore.drainJson(seq)

    // ── Internal ─────────────────────────────────────────────────────────────

    private fun command(action: String, foreground: Boolean = false) {
        val intent = Intent(context, GpsTrackingService::class.java).apply { this.action = action }
        // START/RESUME must go through startForegroundService (API 26+); control
        // actions reach the already-running service with plain startService.
        if (foreground) context.startForegroundService(intent) else context.startService(intent)
    }

    private fun resolvePermCallback(id: String, granted: Boolean) {
        // One shared escaping API (validates the id, escapes the payload).
        val script = BridgeSafe.callbackScript("__gpsCB", id, granted.toString()) ?: return
        webView.post { webView.evaluateJavascript(script, null) }
    }
}
