package com.helyx.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.util.Calendar

/**
 * Schedules the daily training reminder as a real OS alarm so it fires even
 * when the app is closed or the screen is off — unlike the JS setTimeout path,
 * which Android freezes on background. Uses inexact repeating alarms (no
 * SCHEDULE_EXACT_ALARM permission needed; a training nudge doesn't need
 * to-the-minute precision) and re-arms after reboot via BootReceiver.
 *
 * The reminder's hour/minute + enabled flag are persisted so BootReceiver can
 * restore the alarm (all alarms are cleared across a reboot).
 */
object ReminderScheduler {
    private const val PREFS       = "helyx_reminders"
    private const val KEY_ENABLED = "daily_enabled"
    private const val KEY_HOUR    = "daily_hour"
    private const val KEY_MINUTE  = "daily_minute"
    private const val REQUEST_CODE = 4001
    const val ACTION_FIRE = "com.helyx.app.reminder.DAILY"

    fun schedule(context: Context, hour: Int, minute: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_ENABLED, true)
            .putInt(KEY_HOUR, hour)
            .putInt(KEY_MINUTE, minute)
            .apply()
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.setInexactRepeating(
            AlarmManager.RTC_WAKEUP,
            nextTrigger(hour, minute),
            AlarmManager.INTERVAL_DAY,
            pending(context),
        )
    }

    fun cancel(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_ENABLED, false)
            .apply()
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pending(context))
    }

    /** Re-arm from persisted settings (used after reboot). */
    fun rescheduleFromPrefs(context: Context) {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!p.getBoolean(KEY_ENABLED, false)) return
        schedule(context, p.getInt(KEY_HOUR, 7), p.getInt(KEY_MINUTE, 30))
    }

    private fun nextTrigger(hour: Int, minute: Int): Long {
        val now = Calendar.getInstance()
        val t = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (t.timeInMillis <= now.timeInMillis) t.add(Calendar.DAY_OF_YEAR, 1)
        return t.timeInMillis
    }

    private fun pending(context: Context): PendingIntent {
        val i = Intent(context, ReminderReceiver::class.java).apply { action = ACTION_FIRE }
        return PendingIntent.getBroadcast(
            context, REQUEST_CODE, i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}

/** Fired by the daily alarm; posts the reminder notification. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        NotifyBridge.post(
            context,
            "Helyx",
            "Time to train — log today's session and keep your plan on track. 💪",
            "training-reminder",
        )
    }
}

/** Re-arms the daily reminder after a device reboot (alarms don't survive it). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            ReminderScheduler.rescheduleFromPrefs(context)
        }
    }
}
