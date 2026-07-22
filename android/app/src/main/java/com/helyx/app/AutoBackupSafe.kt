package com.helyx.app

import java.time.LocalDate

/** Pure validation and retention rules for automatic portable JSON backups. */
object AutoBackupSafe {
    const val MAX_CONTENT_BYTES = 100 * 1024 * 1024
    const val LATEST_NAME = "helyx-auto-latest.json"
    private val REASON = Regex("^[a-z][a-z-]{0,31}$")
    private val DAILY = Regex("^helyx-auto-(\\d{4}-\\d{2}-\\d{2})\\.json$")
    private val WEEKLY = Regex("^helyx-auto-week-(\\d{4}-\\d{2}-\\d{2})\\.json$")

    data class Request(
        val content: String,
        val dayKey: String,
        val weekKey: String,
        val reason: String,
        val callbackId: String,
    )

    data class Names(val latest: String, val daily: String, val weekly: String)

    fun request(
        content: String?,
        dayKey: String?,
        weekKey: String?,
        reason: String?,
        callbackId: String?,
    ): Request? {
        val safeContent = content ?: return null
        if (safeContent.toByteArray(Charsets.UTF_8).size > MAX_CONTENT_BYTES) return null
        val safeDay = validDate(dayKey) ?: return null
        val safeWeek = validDate(weekKey) ?: return null
        val safeReason = reason?.takeIf { REASON.matches(it) } ?: return null
        val safeCallback = BridgeSafe.callbackId(callbackId) ?: return null
        return Request(safeContent, safeDay, safeWeek, safeReason, safeCallback)
    }

    fun names(dayKey: String, weekKey: String): Names = Names(
        latest = LATEST_NAME,
        daily = "helyx-auto-$dayKey.json",
        weekly = "helyx-auto-week-$weekKey.json",
    )

    /** Oldest dated files beyond the bounded daily/weekly retention windows. */
    fun namesToDelete(existing: Collection<String>, keepDaily: Int = 7, keepWeekly: Int = 4): Set<String> {
        fun overflow(regex: Regex, keep: Int) = existing
            .filter { regex.matches(it) }
            .sortedDescending()
            .drop(keep.coerceAtLeast(0))
        return (overflow(DAILY, keepDaily) + overflow(WEEKLY, keepWeekly)).toSet()
    }

    fun callbackScript(callbackId: String?, payload: String): String? =
        BridgeSafe.callbackScript("__autoBackupCB", callbackId, payload)

    private fun validDate(value: String?): String? {
        val text = value ?: return null
        return runCatching { LocalDate.parse(text).toString() }.getOrNull()
    }
}
