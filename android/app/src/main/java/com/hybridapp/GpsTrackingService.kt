package com.hybridapp

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Thread-safe store for the current run. The service appends fixes; the JS
 * bridge reads them by sequence number, so the WebView can freeze (screen off,
 * app switch, activity killed) and catch up losslessly when it wakes.
 *
 * Holds the FULL point list for the active run: recovery after an activity
 * restart is just getPointsSince(0). Cleared when a new run starts.
 */
object GpsPointStore {
    data class Point(val lat: Double, val lng: Double, val acc: Float, val t: Long)

    const val STATUS_IDLE = "IDLE"
    const val STATUS_TRACKING = "TRACKING"
    const val STATUS_PAUSED = "PAUSED"

    private val points = ArrayList<Point>()
    private var status = STATUS_IDLE
    private var startedAtMs = 0L      // wall clock at run start
    private var pausedAccumMs = 0L    // total paused time so far
    private var pausedSinceMs = 0L    // wall clock when the current pause began (0 = not paused)

    @Synchronized fun startRun() {
        points.clear()
        status = STATUS_TRACKING
        startedAtMs = System.currentTimeMillis()
        pausedAccumMs = 0L
        pausedSinceMs = 0L
    }

    @Synchronized fun pauseRun() {
        if (status != STATUS_TRACKING) return
        status = STATUS_PAUSED
        pausedSinceMs = System.currentTimeMillis()
    }

    @Synchronized fun resumeRun() {
        if (status != STATUS_PAUSED) return
        status = STATUS_TRACKING
        if (pausedSinceMs > 0) pausedAccumMs += System.currentTimeMillis() - pausedSinceMs
        pausedSinceMs = 0L
    }

    @Synchronized fun stopRun() {
        status = STATUS_IDLE
        pausedSinceMs = 0L
        // points are kept until the next startRun() so a final drain still works
    }

    @Synchronized fun addPoint(lat: Double, lng: Double, acc: Float, t: Long) {
        if (status == STATUS_TRACKING) points.add(Point(lat, lng, acc, t))
    }

    @Synchronized fun getStatus(): String = status

    /** Elapsed active (non-paused) run time in ms. */
    @Synchronized fun elapsedMs(): Long {
        if (startedAtMs == 0L) return 0L
        val pausedNow = if (pausedSinceMs > 0) System.currentTimeMillis() - pausedSinceMs else 0L
        return System.currentTimeMillis() - startedAtMs - pausedAccumMs - pausedNow
    }

    /**
     * JSON payload of every point with index >= sinceSeq, plus run metadata.
     * Built by hand (values are all numeric) to avoid pulling org.json into a
     * hot path; shape: {"seq":N,"status":"TRACKING","elapsedMs":123,"points":[[lat,lng,acc,t],…]}
     */
    @Synchronized fun drainJson(sinceSeq: Int): String {
        val from = sinceSeq.coerceIn(0, points.size)
        val sb = StringBuilder(64 + (points.size - from) * 48)
        sb.append("{\"seq\":").append(points.size)
            .append(",\"status\":\"").append(status)
            .append("\",\"elapsedMs\":").append(elapsedMs())
            .append(",\"points\":[")
        for (i in from until points.size) {
            val p = points[i]
            if (i > from) sb.append(',')
            sb.append('[').append(p.lat).append(',').append(p.lng)
                .append(',').append(p.acc).append(',').append(p.t).append(']')
        }
        sb.append("]}")
        return sb.toString()
    }
}

/**
 * Foreground service that keeps GPS alive for the whole run — screen locked,
 * app switched, or activity killed. Android requires the persistent
 * notification; that is what stops the OS from reclaiming location access.
 *
 * Control via intent actions (ACTION_START/PAUSE/RESUME/STOP). Points flow
 * into GpsPointStore; the WebView pulls them through GpsBridge.
 */
class GpsTrackingService : Service(), LocationListener {

    companion object {
        const val ACTION_START  = "com.hybridapp.gps.START"
        const val ACTION_PAUSE  = "com.hybridapp.gps.PAUSE"
        const val ACTION_RESUME = "com.hybridapp.gps.RESUME"
        const val ACTION_STOP   = "com.hybridapp.gps.STOP"

        const val CHANNEL_ID = "run_tracking"
        private const val NOTIFICATION_ID = 2001
        private const val UPDATE_INTERVAL_MS = 1000L

        fun createChannel(context: Context) {
            val nm = context.getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Run Tracking",
                    NotificationManager.IMPORTANCE_LOW, // silent, non-intrusive
                ).apply {
                    description = "Shown while a run is being GPS-tracked so tracking survives the screen locking"
                }
            )
        }
    }

    private var listening = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                if (!hasLocationPermission()) { stopSelf(); return START_NOT_STICKY }
                GpsPointStore.startRun()
                startForeground(NOTIFICATION_ID, buildNotification("Run in progress"))
                startListening()
            }
            ACTION_PAUSE -> {
                GpsPointStore.pauseRun()
                stopListening() // no fixes wanted while paused; saves battery
                notifyText("Run paused")
            }
            ACTION_RESUME -> {
                GpsPointStore.resumeRun()
                startListening()
                notifyText("Run in progress")
            }
            ACTION_STOP -> {
                GpsPointStore.stopRun()
                stopListening()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        // If the OS kills us mid-run it should not restart with a stale intent:
        // the run's JS context is gone; a zombie notification helps nobody.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopListening()
        super.onDestroy()
    }

    // ── Location plumbing ────────────────────────────────────────────────────

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    private fun startListening() {
        if (listening || !hasLocationPermission()) return
        val lm = getSystemService(LOCATION_SERVICE) as LocationManager
        try {
            lm.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                UPDATE_INTERVAL_MS,
                0f,
                this,
                Looper.getMainLooper(),
            )
            listening = true
        } catch (_: SecurityException) {
            stopSelf()
        } catch (_: IllegalArgumentException) {
            // GPS provider missing (rare emulators) — nothing to track with.
            stopSelf()
        }
    }

    private fun stopListening() {
        if (!listening) return
        val lm = getSystemService(LOCATION_SERVICE) as LocationManager
        lm.removeUpdates(this)
        listening = false
    }

    override fun onLocationChanged(location: Location) {
        GpsPointStore.addPoint(
            location.latitude,
            location.longitude,
            location.accuracy,
            location.time.takeIf { it > 0 } ?: System.currentTimeMillis(),
        )
    }

    // Required by older API levels of the LocationListener interface.
    @Deprecated("Deprecated in API 29")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {}

    // ── Notification ─────────────────────────────────────────────────────────

    private fun buildNotification(text: String): Notification {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pi = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Helyx")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun notifyText(text: String) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification(text))
    }
}
