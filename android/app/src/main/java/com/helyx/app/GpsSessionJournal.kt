package com.helyx.app

import java.io.DataInputStream
import java.io.EOFException
import java.io.File
import java.io.FileInputStream
import java.io.RandomAccessFile
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.Properties

/** Disk representation of one raw location fix in the active GPS session. */
data class JournalGpsPoint(val lat: Double, val lng: Double, val acc: Float, val t: Long)

/**
 * Minimal state needed to rebuild an active run after Android recreates the process.
 * `FINALIZING` means collection stopped but JS has not yet acknowledged the saved session.
 */
data class JournalGpsSession(
    val status: String,
    val startedAtMs: Long,
    val pausedAccumMs: Long,
    val pausedSinceMs: Long,
    val points: List<JournalGpsPoint>,
)

interface GpsSessionJournal {
    fun start(session: JournalGpsSession): Boolean
    fun saveState(session: JournalGpsSession): Boolean
    fun append(point: JournalGpsPoint): Boolean
    fun load(): JournalGpsSession?
    fun hasPendingData(): Boolean
    fun clear(): Boolean
}

/**
 * Small append-only journal in app-private storage.
 *
 * Metadata is replaced atomically only on lifecycle transitions. Points are fixed-width
 * binary records appended and fsynced one at a time, so a killed process can lose at most
 * a partially-written final record; [load] ignores that incomplete tail. No health or GPS
 * values leave the device or app-private directory.
 */
class FileGpsSessionJournal(private val directory: File) : GpsSessionJournal {
    private val metadataFile = File(directory, "active.meta")
    private val pointsFile = File(directory, "active.points")

    override fun start(session: JournalGpsSession): Boolean = runCatching {
        require(session.status == GpsPointStore.STATUS_TRACKING)
        ensureDirectory()
        val tmp = File(directory, "active.points.tmp")
        RandomAccessFile(tmp, "rw").use { out ->
            out.setLength(0)
            out.writeInt(POINT_MAGIC)
            out.writeInt(FORMAT_VERSION)
            out.fd.sync()
        }
        replaceAtomically(tmp, pointsFile)
        check(writeMetadata(session))
        true
    }.getOrDefault(false)

    override fun saveState(session: JournalGpsSession): Boolean = runCatching {
        ensureDirectory()
        writeMetadata(session)
    }.getOrDefault(false)

    override fun append(point: JournalGpsPoint): Boolean = runCatching {
        require(point.lat.isFinite() && point.lat in -90.0..90.0)
        require(point.lng.isFinite() && point.lng in -180.0..180.0)
        require(point.acc.isFinite() && point.acc >= 0f)
        require(point.t > 0L)
        ensureDirectory()
        if (!pointsFile.exists()) initialisePointFile(pointsFile)
        RandomAccessFile(pointsFile, "rw").use { out ->
            checkHeader(out)
            out.seek(out.length())
            out.writeDouble(point.lat)
            out.writeDouble(point.lng)
            out.writeFloat(point.acc)
            out.writeLong(point.t)
            out.fd.sync()
        }
        true
    }.getOrDefault(false)

    override fun load(): JournalGpsSession? = runCatching {
        if (!metadataFile.isFile || !pointsFile.isFile) return null
        val props = Properties().apply {
            FileInputStream(metadataFile).use { input -> load(input) }
        }
        if (props.getProperty("version")?.toIntOrNull() != FORMAT_VERSION) return null
        val status = props.getProperty("status")
        if (status !in VALID_STATUSES) return null
        val startedAtMs = props.longValue("startedAtMs") ?: return null
        val pausedAccumMs = props.longValue("pausedAccumMs") ?: return null
        val pausedSinceMs = props.longValue("pausedSinceMs") ?: return null
        if (startedAtMs <= 0L || pausedAccumMs < 0L || pausedSinceMs < 0L) return null

        val points = ArrayList<JournalGpsPoint>()
        DataInputStream(FileInputStream(pointsFile).buffered()).use { input ->
            if (input.readInt() != POINT_MAGIC || input.readInt() != FORMAT_VERSION) return null
            while (points.size < MAX_POINTS) {
                try {
                    val point = JournalGpsPoint(
                        lat = input.readDouble(),
                        lng = input.readDouble(),
                        acc = input.readFloat(),
                        t = input.readLong(),
                    )
                    if (point.lat.isFinite() && point.lat in -90.0..90.0 &&
                        point.lng.isFinite() && point.lng in -180.0..180.0 &&
                        point.acc.isFinite() && point.acc >= 0f && point.t > 0L
                    ) points.add(point)
                } catch (_: EOFException) {
                    break // a process kill may leave one incomplete tail record
                }
            }
        }
        JournalGpsSession(status, startedAtMs, pausedAccumMs, pausedSinceMs, points)
    }.getOrNull()

    override fun hasPendingData(): Boolean = metadataFile.exists() || pointsFile.exists()

    override fun clear(): Boolean = runCatching {
        var ok = true
        for (file in listOf(metadataFile, pointsFile, File(directory, "active.meta.tmp"), File(directory, "active.points.tmp"))) {
            if (file.exists() && !file.delete()) ok = false
        }
        ok
    }.getOrDefault(false)

    private fun writeMetadata(session: JournalGpsSession): Boolean {
        if (session.status !in VALID_STATUSES || session.startedAtMs <= 0L ||
            session.pausedAccumMs < 0L || session.pausedSinceMs < 0L
        ) return false
        val props = Properties().apply {
            setProperty("version", FORMAT_VERSION.toString())
            setProperty("status", session.status)
            setProperty("startedAtMs", session.startedAtMs.toString())
            setProperty("pausedAccumMs", session.pausedAccumMs.toString())
            setProperty("pausedSinceMs", session.pausedSinceMs.toString())
        }
        val tmp = File(directory, "active.meta.tmp")
        java.io.FileOutputStream(tmp).use { output ->
            props.store(output, "Helyx active GPS session")
            output.flush()
            output.fd.sync()
        }
        replaceAtomically(tmp, metadataFile)
        return true
    }

    private fun initialisePointFile(file: File) {
        RandomAccessFile(file, "rw").use { out ->
            out.setLength(0)
            out.writeInt(POINT_MAGIC)
            out.writeInt(FORMAT_VERSION)
            out.fd.sync()
        }
    }

    private fun checkHeader(file: RandomAccessFile) {
        check(file.length() >= HEADER_BYTES)
        file.seek(0)
        check(file.readInt() == POINT_MAGIC)
        check(file.readInt() == FORMAT_VERSION)
    }

    private fun replaceAtomically(source: File, destination: File) {
        try {
            Files.move(
                source.toPath(), destination.toPath(),
                StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE,
            )
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(source.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }

    private fun ensureDirectory() {
        check((directory.isDirectory || directory.mkdirs()) && directory.canWrite())
    }

    private fun Properties.longValue(key: String): Long? = getProperty(key)?.toLongOrNull()

    companion object {
        private const val POINT_MAGIC = 0x48475831 // HGX1
        private const val FORMAT_VERSION = 1
        private const val HEADER_BYTES = 8L
        private const val MAX_POINTS = 100_000 // >27 hours at 1 Hz; bounds corrupt files
        private val VALID_STATUSES = setOf(
            GpsPointStore.STATUS_TRACKING,
            GpsPointStore.STATUS_PAUSED,
            GpsPointStore.STATUS_FINALIZING,
        )
    }
}
