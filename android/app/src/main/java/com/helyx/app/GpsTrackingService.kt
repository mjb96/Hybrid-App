package com.helyx.app

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
    const val STATUS_FINALIZING = "FINALIZING"
    const val STATUS_RECOVERY_ERROR = "RECOVERY_ERROR"

    private val points = ArrayList<Point>()
    private var status = STATUS_IDLE
    private var startedAtMs = 0L      // wall clock at run start
    private var pausedAccumMs = 0L    // total paused time so far
    private var pausedSinceMs = 0L    // wall clock when the current pause began (0 = not paused)
    private var journal: GpsSessionJournal? = null
    private var initialized = false
    private var restoredFromDisk = false
    private var durable = false

    /** Load the app-private active-session journal once per Android process. */
    @Synchronized fun initialize(context: Context) {
        if (initialized) return
        initialized = true
        journal = FileGpsSessionJournal(java.io.File(context.filesDir, "gps-active-session"))
        val saved = journal?.load()
        if (saved == null) {
            if (journal?.hasPendingData() == true) {
                status = STATUS_RECOVERY_ERROR
                restoredFromDisk = true
                durable = false
            }
            return
        }
        points.clear()
        points.addAll(saved.points.map { Point(it.lat, it.lng, it.acc, it.t) })
        startedAtMs = saved.startedAtMs
        pausedAccumMs = saved.pausedAccumMs
        status = saved.status
        pausedSinceMs = saved.pausedSinceMs
        restoredFromDisk = true
        durable = true

        // A recreated process cannot prove GPS was collected during the gap. Recover
        // explicitly paused at the last durable fix so elapsed time never includes an
        // unobserved process-death interval.
        if (status == STATUS_TRACKING) {
            val now = System.currentTimeMillis()
            val lastDurableAt = (points.lastOrNull()?.t ?: startedAtMs).coerceIn(startedAtMs, now)
            status = STATUS_PAUSED
            pausedSinceMs = lastDurableAt
            durable = persistState()
        }
    }

    /** Refuse to start if an unfinalized journal exists or durable storage is unavailable. */
    @Synchronized fun startRun(): Boolean {
        if (status != STATUS_IDLE) return false
        val now = System.currentTimeMillis()
        val fresh = JournalGpsSession(STATUS_TRACKING, now, 0L, 0L, emptyList())
        if (journal?.start(fresh) != true) {
            durable = false
            return false
        }
        points.clear()
        status = STATUS_TRACKING
        startedAtMs = now
        pausedAccumMs = 0L
        pausedSinceMs = 0L
        restoredFromDisk = false
        durable = true
        return true
    }

    @Synchronized fun pauseRun(): Boolean {
        if (status != STATUS_TRACKING) return status == STATUS_PAUSED
        status = STATUS_PAUSED
        pausedSinceMs = System.currentTimeMillis()
        durable = persistState()
        return durable
    }

    @Synchronized fun resumeRun(): Boolean {
        if (status != STATUS_PAUSED) return status == STATUS_TRACKING
        val priorPausedAccum = pausedAccumMs
        val priorPausedSince = pausedSinceMs
        if (pausedSinceMs > 0) pausedAccumMs += System.currentTimeMillis() - pausedSinceMs
        pausedSinceMs = 0L
        status = STATUS_TRACKING
        if (!persistState()) {
            status = STATUS_PAUSED
            pausedAccumMs = priorPausedAccum
            pausedSinceMs = priorPausedSince.takeIf { it > 0 } ?: System.currentTimeMillis()
            durable = false
            return false
        }
        restoredFromDisk = false
        durable = true
        return true
    }

    /** Stop collection but retain the journal until JS confirms state + route persistence. */
    @Synchronized fun finalizeRun(): Boolean {
        if (status == STATUS_IDLE) return false
        if (pausedSinceMs == 0L) pausedSinceMs = System.currentTimeMillis()
        status = STATUS_FINALIZING
        durable = persistState()
        return durable
    }

    /** Clear only after a completed save or an explicit discard. */
    @Synchronized fun clearRun(): Boolean {
        val cleared = journal?.clear() == true
        if (!cleared) return false
        points.clear()
        status = STATUS_IDLE
        startedAtMs = 0L
        pausedAccumMs = 0L
        pausedSinceMs = 0L
        restoredFromDisk = false
        durable = true
        return true
    }

    /** Returns false and pauses the run when a fix cannot be journaled durably. */
    @Synchronized fun addPoint(lat: Double, lng: Double, acc: Float, t: Long): Boolean {
        if (status != STATUS_TRACKING) return false
        val point = Point(lat, lng, acc, t)
        if (journal?.append(JournalGpsPoint(lat, lng, acc, t)) != true) {
            status = STATUS_PAUSED
            pausedSinceMs = System.currentTimeMillis()
            durable = false
            persistState()
            return false
        }
        points.add(point)
        durable = true
        return true
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
     * hot path; shape includes durability/restart evidence for honest JS recovery.
     */
    @Synchronized fun drainJson(sinceSeq: Int): String {
        val from = sinceSeq.coerceIn(0, points.size)
        val sb = StringBuilder(64 + (points.size - from) * 48)
        sb.append("{\"seq\":").append(points.size)
            .append(",\"status\":\"").append(status)
            .append("\",\"elapsedMs\":").append(elapsedMs())
            .append(",\"durable\":").append(durable)
            .append(",\"restored\":").append(restoredFromDisk)
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

    @Synchronized private fun persistState(): Boolean {
        if (status == STATUS_IDLE || startedAtMs <= 0L) return false
        return journal?.saveState(
            JournalGpsSession(status, startedAtMs, pausedAccumMs, pausedSinceMs, emptyList())
        ) == true
    }
}

/**
 * Foreground service that keeps GPS alive for the whole run — screen locked,
 * app switched, or activity killed. Android requires the persistent
 * notification; that is what stops the OS from reclaiming location access.
 *
 * Control via intent actions (ACTION_START/PAUSE/RESUME). Points flow
 * into GpsPointStore; the WebView pulls them through GpsBridge.
 */
class GpsTrackingService : Service(), LocationListener {

    companion object {
        const val ACTION_START  = "com.helyx.app.gps.START"
        const val ACTION_PAUSE  = "com.helyx.app.gps.PAUSE"
        const val ACTION_RESUME = "com.helyx.app.gps.RESUME"

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

    override fun onCreate() {
        super.onCreate()
        GpsPointStore.initialize(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                if (!hasLocationPermission()) { stopSelf(); return START_NOT_STICKY }
                if (GpsPointStore.getStatus() == GpsPointStore.STATUS_IDLE && !GpsPointStore.startRun()) {
                    stopSelf()
                    return START_NOT_STICKY
                }
                val tracking = GpsPointStore.getStatus() == GpsPointStore.STATUS_TRACKING
                startForeground(
                    NOTIFICATION_ID,
                    buildNotification(if (tracking) "Run in progress" else "Run recovered — open Helyx to resume"),
                )
                if (tracking) startListening()
            }
            ACTION_PAUSE -> {
                startForeground(NOTIFICATION_ID, buildNotification("Run paused"))
                GpsPointStore.pauseRun()
                stopListening() // no fixes wanted while paused; saves battery
                notifyText("Run paused")
            }
            ACTION_RESUME -> {
                startForeground(NOTIFICATION_ID, buildNotification("Run resuming"))
                if (GpsPointStore.resumeRun()) {
                    startListening()
                    notifyText("Run in progress")
                } else {
                    stopListening()
                    notifyText("Tracking paused — storage unavailable")
                }
            }
            null -> {
                // Android may recreate the service after reclaiming the process. The
                // journal intentionally restores TRACKING as PAUSED, so no unobserved
                // gap is counted and the athlete must explicitly resume or finish.
                if (GpsPointStore.getStatus() == GpsPointStore.STATUS_PAUSED) {
                    startForeground(
                        NOTIFICATION_ID,
                        buildNotification("Run recovered — open Helyx to resume"),
                    )
                } else {
                    stopSelf()
                }
            }
        }
        return START_REDELIVER_INTENT
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
        val stored = GpsPointStore.addPoint(
            location.latitude,
            location.longitude,
            location.accuracy,
            location.time.takeIf { it > 0 } ?: System.currentTimeMillis(),
        )
        if (!stored && GpsPointStore.getStatus() == GpsPointStore.STATUS_PAUSED) {
            stopListening()
            notifyText("Tracking paused — storage unavailable")
        }
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
