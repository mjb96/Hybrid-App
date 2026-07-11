package com.helyx.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.NotificationCompat
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.abs

/**
 * Android JavascriptInterface injected as `window.HybridNotifyBridge`.
 *
 * Android System WebView does not implement the Web Notifications API, so the
 * app's training reminders (daily / weekly / streak / missed) can't use
 * `new Notification()` here. This bridge gives the web layer a native path for
 * both the POST_NOTIFICATIONS permission (Android 13+) and showing a
 * notification through the OS.
 *
 * JS contract:
 *   hasPermission()                   → Boolean (always true below Android 13)
 *   requestPermission(callbackId)     → void; resolves window.__notifCB[id]('true'|'false')
 *   showNotification(title, body, tag) → void
 */
class NotifyBridge(
    private val context: Context,
    private val webView: WebView,
    private val requestOsPermission: () -> Unit,
) {
    private val pendingCallbackId = AtomicReference<String?>()

    companion object {
        const val CHANNEL_ID = "reminders"
        private const val NOTIFICATION_ID_BASE = 3000

        fun createChannel(context: Context) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Training Reminders",
                    NotificationManager.IMPORTANCE_DEFAULT,
                ).apply {
                    description = "Daily training reminders, streak alerts, and weekly summaries"
                }
            )
        }

        // Static poster shared by the JS bridge and the background alarm receiver.
        fun post(context: Context, title: String, body: String, tag: String) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED) return
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            val pi = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build()
            // Stable id per tag so re-firing the same kind replaces instead of stacking.
            val id = NOTIFICATION_ID_BASE + abs(tag.hashCode() % 1000)
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .notify(id, notification)
        }
    }

    @JavascriptInterface
    fun hasPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    @JavascriptInterface
    fun requestPermission(callbackId: String) {
        val safeId = BridgeSafe.callbackId(callbackId) ?: return
        if (hasPermission()) { resolve(safeId, true); return }
        pendingCallbackId.set(safeId)
        webView.post { requestOsPermission() }
    }

    /** Called by MainActivity when the OS permission dialog resolves. */
    fun onPermissionResult(granted: Boolean) {
        val id = pendingCallbackId.getAndSet(null) ?: return
        resolve(id, granted)
    }

    @JavascriptInterface
    fun showNotification(title: String, body: String, tag: String) {
        post(context, title, body, tag)
    }

    // Background daily reminder scheduling (survives app close / screen off,
    // unlike the JS setTimeout path). See ReminderScheduler.
    @JavascriptInterface
    fun scheduleDailyReminder(hour: Int, minute: Int) {
        ReminderScheduler.schedule(context, hour, minute)
    }

    @JavascriptInterface
    fun cancelDailyReminder() {
        ReminderScheduler.cancel(context)
    }

    private fun resolve(id: String, granted: Boolean) {
        val safe = BridgeSafe.callbackId(id) ?: return
        webView.post {
            webView.evaluateJavascript(
                "if(window.__notifCB&&window.__notifCB['$safe'])" +
                "{window.__notifCB['$safe']('$granted');delete window.__notifCB['$safe'];}",
                null,
            )
        }
    }
}
