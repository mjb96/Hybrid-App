package com.helyx.app

import java.io.File
import java.io.RandomAccessFile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class GpsSessionJournalTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    private fun journal(): Pair<FileGpsSessionJournal, File> {
        val dir = temporaryFolder.newFolder("gps-journal")
        return FileGpsSessionJournal(dir) to dir
    }

    private fun tracking() = JournalGpsSession(
        status = GpsPointStore.STATUS_TRACKING,
        startedAtMs = 1_000L,
        pausedAccumMs = 0L,
        pausedSinceMs = 0L,
        points = emptyList(),
    )

    @Test
    fun `start append and load round trip exact session data`() {
        val (journal, _) = journal()
        assertTrue(journal.start(tracking()))
        assertTrue(journal.append(JournalGpsPoint(-33.8688, 151.2093, 6.5f, 2_000L)))
        assertTrue(journal.append(JournalGpsPoint(-33.8680, 151.2100, 7f, 3_000L)))

        val loaded = journal.load()!!
        assertEquals(GpsPointStore.STATUS_TRACKING, loaded.status)
        assertEquals(1_000L, loaded.startedAtMs)
        assertEquals(2, loaded.points.size)
        assertEquals(151.2100, loaded.points.last().lng, 0.000001)
    }

    @Test
    fun `pause and finalizing metadata replace without rewriting points`() {
        val (journal, _) = journal()
        assertTrue(journal.start(tracking()))
        assertTrue(journal.append(JournalGpsPoint(51.5, -0.12, 5f, 2_000L)))
        assertTrue(journal.saveState(tracking().copy(
            status = GpsPointStore.STATUS_PAUSED,
            pausedAccumMs = 400L,
            pausedSinceMs = 2_500L,
        )))
        assertEquals(GpsPointStore.STATUS_PAUSED, journal.load()!!.status)

        assertTrue(journal.saveState(tracking().copy(
            status = GpsPointStore.STATUS_FINALIZING,
            pausedAccumMs = 400L,
        )))
        val final = journal.load()!!
        assertEquals(GpsPointStore.STATUS_FINALIZING, final.status)
        assertEquals(1, final.points.size)
    }

    @Test
    fun `partial tail record after process death is ignored`() {
        val (journal, dir) = journal()
        assertTrue(journal.start(tracking()))
        assertTrue(journal.append(JournalGpsPoint(40.0, -73.0, 4f, 2_000L)))
        RandomAccessFile(File(dir, "active.points"), "rw").use { file ->
            file.seek(file.length())
            file.write(byteArrayOf(1, 2, 3, 4, 5))
        }

        val loaded = journal.load()!!
        assertEquals(1, loaded.points.size)
        assertEquals(40.0, loaded.points.single().lat, 0.0)
    }

    @Test
    fun `invalid point is refused without corrupting journal`() {
        val (journal, _) = journal()
        assertTrue(journal.start(tracking()))
        assertFalse(journal.append(JournalGpsPoint(200.0, 0.0, 5f, 2_000L)))
        assertTrue(journal.load()!!.points.isEmpty())
    }

    @Test
    fun `clear removes the recoverable session`() {
        val (journal, _) = journal()
        assertTrue(journal.start(tracking()))
        assertTrue(journal.append(JournalGpsPoint(1.0, 2.0, 3f, 2_000L)))
        assertTrue(journal.clear())
        assertNull(journal.load())
    }
}
