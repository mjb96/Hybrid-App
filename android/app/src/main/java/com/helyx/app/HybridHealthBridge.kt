package com.helyx.app

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.NotificationCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.util.concurrent.atomic.AtomicReference

/**
 * Android JavascriptInterface injected as `window.HybridHealthBridge`.
 *
 * JS contract:
 *   getAvailabilityStatus()                                        → String sync
 *   requestPermissions(fieldsJson, callbackId)                     → void; resolves via __hcCB[callbackId]
 *   readHealthDataByDay(startIso, endIso, fieldsJson, callbackId)  → void; resolves via __hcCB[callbackId]
 *
 * `fieldsJson` is a JSON array of SUPPORTED FIELD IDS from the shared contract
 * (HealthFieldContract / js/health/health-fields.js): "steps", "restingHR",
 * "hrv", "sleep". Permissions are requested and records are read for EXACTLY the
 * fields in that array — never for a field the user did not select.
 *
 * requestPermissions resolves with:
 *   { granted: [fieldId...], denied: [fieldId...] }
 *
 * readHealthDataByDay resolves with:
 *   {
 *     granted: [fieldId...],       // selected fields currently permission-granted
 *     days: [{
 *       date: "YYYY-MM-DD",        // local calendar date (device timezone)
 *       steps: number|absent,
 *       sleepSessions: [{ durationMs, score, startTime, stages }]|absent,
 *       restingHeartRate: number|null,  // bpm
 *       hrvRmssd: number|null,          // ms
 *     }],
 *     errors: [fieldId...],        // selected+granted fields whose read threw
 *   }
 * A day bucket only carries keys for fields that were both selected AND granted.
 * Records older than 30 days require READ_HEALTH_DATA_HISTORY; when that is
 * denied Health Connect omits them and the caller degrades to a 30-day window.
 *
 * Async results are delivered by calling window.__hcCB[callbackId](jsonString)
 * and then deleting the key. The JS side registers callbacks before each call.
 */
class HybridHealthBridge(
    private val context: Context,
    private val webView: WebView,
    private val launchPermissions: (Set<String>) -> Unit,
    private val requestNotificationPermission: (() -> Unit) = {},
) {
    private val client by lazy { HealthConnectClient.getOrCreate(context) }
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val pendingPermCallbackId = AtomicReference<String?>()
    private val pendingPermFields = AtomicReference<List<String>>(emptyList())

    companion object {
        const val NOTIFICATION_CHANNEL_ID  = "rest_timer"
        private const val NOTIFICATION_ID_REST_TIMER = 1001
    }

    // ── Synchronous bridge method ─────────────────────────────────────────────

    @JavascriptInterface
    fun getAvailabilityStatus(): String {
        return when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE                           -> "AVAILABLE"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "NOT_INSTALLED"
            else                                                        -> "NOT_SUPPORTED"
        }
    }

    // ── Async bridge methods — results delivered via JS callback ─────────────

    @JavascriptInterface
    fun requestPermissions(fieldsJson: String, callbackId: String) {
        val requested = parseFieldIds(fieldsJson)
        val selected = HealthFieldContract.sanitize(requested)
        val permissions = HealthFieldContract.permissionsForFields(selected)

        // An empty/unsupported selection must NEVER launch a permission request.
        if (permissions.isEmpty()) {
            val json = JSONObject().apply {
                put("granted", JSONArray())
                put("denied",  JSONArray(selected))
            }.toString()
            resolveCallback(callbackId, json)
            return
        }

        pendingPermFields.set(selected)
        pendingPermCallbackId.set(callbackId)
        webView.post { launchPermissions(permissions) }
    }

    /** Called by MainActivity after the Health Connect permission activity returns. */
    fun onPermissionResult(granted: Set<String>) {
        val callbackId = pendingPermCallbackId.getAndSet(null) ?: return
        val selected = pendingPermFields.getAndSet(emptyList())
        val grantedFields = HealthFieldContract.grantedFields(granted)
        // Report only fields the user actually selected.
        val grantedSelected = selected.filter { it in grantedFields }
        val deniedSelected  = selected.filter { it !in grantedFields }
        val json = JSONObject().apply {
            put("granted", JSONArray(grantedSelected))
            put("denied",  JSONArray(deniedSelected))
        }.toString()
        resolveCallback(callbackId, json)
    }

    /**
     * Returns per-calendar-day health summaries for the given date range and the
     * SELECTED fields only. Each granted field's records are bucketed by local
     * calendar day; a field that is selected but not currently granted is simply
     * omitted (reflected in the returned `granted` list). Data older than 30 days
     * requires READ_HEALTH_DATA_HISTORY; if absent Health Connect omits it.
     */
    @JavascriptInterface
    fun readHealthDataByDay(startIso: String, endIso: String, fieldsJson: String, callbackId: String) {
        val selected = HealthFieldContract.sanitize(parseFieldIds(fieldsJson))
        scope.launch {
            val json = runCatching { fetchByDay(startIso, endIso, selected) }
                .getOrElse { "{\"granted\":[],\"days\":[],\"errors\":[]}" }
            resolveCallback(callbackId, json)
        }
    }

    @JavascriptInterface
    fun notifyRestComplete(title: String, body: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                // Ask for permission; the next timer completion will fire the notification.
                webView.post { requestNotificationPermission() }
                return
            }
        }
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pi = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIFICATION_ID_REST_TIMER, notification)
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private fun parseFieldIds(json: String): List<String> = runCatching {
        JSONArray(json).let { arr -> (0 until arr.length()).map { arr.getString(it) } }
    }.getOrDefault(emptyList())

    private fun resolveCallback(id: String, json: String) {
        val escaped = json.replace("\\", "\\\\").replace("'", "\\'")
        webView.post {
            webView.evaluateJavascript(
                "if(window.__hcCB&&window.__hcCB['$id'])" +
                "{window.__hcCB['$id']('$escaped');delete window.__hcCB['$id'];}",
                null,
            )
        }
    }

    /**
     * Fetches the SELECTED-and-GRANTED health records for the range and buckets
     * them into per-local-calendar-day summaries. Only the fields the user
     * selected are read; a read that throws adds the field to `errors`.
     */
    private suspend fun fetchByDay(startIso: String, endIso: String, selectedFields: List<String>): String {
        val zone = ZoneId.systemDefault()
        val start = Instant.parse(startIso)
        val end   = Instant.parse(endIso)
        val range = TimeRangeFilter.between(start, end)

        val grantedPerms = runCatching { client.permissionController.getGrantedPermissions() }
            .getOrDefault(emptySet())
        val grantedFields = HealthFieldContract.grantedFields(grantedPerms)
        // Read only fields that are BOTH selected AND currently granted.
        val readable = selectedFields.filter { it in grantedFields }
        val errors = mutableListOf<String>()

        suspend fun <T> readField(id: String, block: suspend () -> List<T>): List<T> =
            if (id in readable) runCatching { block() }.getOrElse { errors.add(id); emptyList() }
            else emptyList()

        val stepsRecs = readField("steps") {
            client.readRecords(ReadRecordsRequest(StepsRecord::class, range)).records
        }
        val sleepRecs = readField("sleep") {
            client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, range)).records
        }
        val rhrRecs = readField("restingHR") {
            client.readRecords(ReadRecordsRequest(RestingHeartRateRecord::class, range)).records
        }
        val hrvRecs = readField("hrv") {
            client.readRecords(ReadRecordsRequest(HeartRateVariabilityRmssdRecord::class, range)).records
        }

        val startDate = start.atZone(zone).toLocalDate()
        val endDate   = end.atZone(zone).toLocalDate().minusDays(1) // end is exclusive

        val daysArr = JSONArray()
        var day = startDate
        while (!day.isAfter(endDate)) {
            val dayStart = day.atStartOfDay(zone).toInstant()
            val dayEnd   = day.plusDays(1).atStartOfDay(zone).toInstant()
            val bucket = JSONObject().apply { put("date", day.toString()) } // YYYY-MM-DD
            var hasAny = false

            if ("steps" in readable) {
                bucket.put("steps", stepsRecs.filter { it.startTime >= dayStart && it.startTime < dayEnd }.sumOf { it.count })
                hasAny = true
            }
            if ("sleep" in readable) {
                val daySleep = JSONArray()
                for (s in sleepRecs.filter { it.startTime >= dayStart && it.startTime < dayEnd }) {
                    val stagesArr = JSONArray()
                    s.stages.forEach { st ->
                        stagesArr.put(JSONObject().apply {
                            put("stage",      sleepStageName(st.stage))
                            put("durationMs", st.endTime.toEpochMilli() - st.startTime.toEpochMilli())
                        })
                    }
                    daySleep.put(JSONObject().apply {
                        put("durationMs", s.endTime.toEpochMilli() - s.startTime.toEpochMilli())
                        put("score",      JSONObject.NULL)
                        put("startTime",  s.startTime.toString())
                        put("stages",     stagesArr)
                    })
                }
                bucket.put("sleepSessions", daySleep)
                hasAny = true
            }
            if ("restingHR" in readable) {
                val dayRhr = rhrRecs.filter { it.time >= dayStart && it.time < dayEnd }.lastOrNull()?.beatsPerMinute
                bucket.put("restingHeartRate", dayRhr ?: JSONObject.NULL)
                hasAny = true
            }
            if ("hrv" in readable) {
                val dayHrv = hrvRecs.filter { it.time >= dayStart && it.time < dayEnd }.lastOrNull()?.heartRateVariabilityMillis
                bucket.put("hrvRmssd", dayHrv ?: JSONObject.NULL)
                hasAny = true
            }

            if (hasAny) daysArr.put(bucket)
            day = day.plusDays(1)
        }

        return JSONObject().apply {
            // Report which SELECTED fields are currently granted so JS can show
            // an honest per-field status (a revocation shrinks this list).
            put("granted", JSONArray(selectedFields.filter { it in grantedFields }))
            put("days",    daysArr)
            put("errors",  JSONArray(errors))
        }.toString()
    }

    private fun sleepStageName(stage: Int): String = when (stage) {
        SleepSessionRecord.STAGE_TYPE_AWAKE,
        SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> "AWAKE"
        SleepSessionRecord.STAGE_TYPE_LIGHT         -> "LIGHT"
        SleepSessionRecord.STAGE_TYPE_DEEP          -> "DEEP"
        SleepSessionRecord.STAGE_TYPE_REM           -> "REM"
        SleepSessionRecord.STAGE_TYPE_SLEEPING      -> "SLEEPING"
        else                                        -> "UNKNOWN"
    }
}
