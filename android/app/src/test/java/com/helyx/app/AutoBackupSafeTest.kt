package com.helyx.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AutoBackupSafeTest {
    @Test
    fun acceptsValidRequestAndBuildsBoundedNames() {
        val request = AutoBackupSafe.request("{\"format\":\"helyx-export\"}", "2026-07-22", "2026-07-20", "session", "backup_123")
        assertNotNull(request)
        assertEquals("2026-07-22", request?.dayKey)
        assertEquals("2026-07-20", request?.weekKey)
        assertEquals("session", request?.reason)

        val names = AutoBackupSafe.names("2026-07-22", "2026-07-20")
        assertEquals("helyx-auto-latest.json", names.latest)
        assertEquals("helyx-auto-2026-07-22.json", names.daily)
        assertEquals("helyx-auto-week-2026-07-20.json", names.weekly)
    }

    @Test
    fun rejectsInvalidDatesReasonAndCallback() {
        assertNull(AutoBackupSafe.request("{}", "2026-02-30", "2026-02-23", "session", "backup_1"))
        assertNull(AutoBackupSafe.request("{}", "2026-07-22", "not-a-date", "session", "backup_1"))
        assertNull(AutoBackupSafe.request("{}", "2026-07-22", "2026-07-20", "SESSION!", "backup_1"))
        assertNull(AutoBackupSafe.request("{}", "2026-07-22", "2026-07-20", "session", "x'];alert(1)//"))
    }

    @Test
    fun retentionKeepsLatestSevenDailyAndFourWeeklyFiles() {
        val daily = (1..10).map { "helyx-auto-2026-07-${it.toString().padStart(2, '0')}.json" }
        val weekly = listOf("2026-06-22", "2026-06-29", "2026-07-06", "2026-07-13", "2026-07-20")
            .map { "helyx-auto-week-$it.json" }
        val existing = daily + weekly + AutoBackupSafe.LATEST_NAME + "my-notes.json"
        val deleted = AutoBackupSafe.namesToDelete(existing)

        assertEquals(setOf(
            "helyx-auto-2026-07-01.json",
            "helyx-auto-2026-07-02.json",
            "helyx-auto-2026-07-03.json",
            "helyx-auto-week-2026-06-22.json",
        ), deleted)
        assertFalse(deleted.contains(AutoBackupSafe.LATEST_NAME))
        assertFalse(deleted.contains("my-notes.json"))
    }

    @Test
    fun callbackUsesSharedEscapingAndRejectsHostileId() {
        val script = AutoBackupSafe.callbackScript("backup_123", "{\"message\":\"safe\"}")
        assertNotNull(script)
        assertTrue(script!!.contains("window.__autoBackupCB['backup_123']"))
        assertNull(AutoBackupSafe.callbackScript("x'];alert(1)//", "{}"))
    }
}
