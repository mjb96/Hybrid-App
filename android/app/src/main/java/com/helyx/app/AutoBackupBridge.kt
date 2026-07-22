package com.helyx.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.atomic.AtomicReference

/**
 * Android-only automatic JSON backup adapter.
 *
 * The athlete explicitly chooses a Storage Access Framework folder once. Helyx
 * then writes portable exports into that shared folder without requesting a new
 * destination for every session. Files remain there if app/WebView data is
 * cleared, while the persisted folder permission can be safely re-established.
 */
class AutoBackupBridge(
    private val context: Context,
    private val webView: WebView,
    private val launchOpenTree: () -> Unit,
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val backupMutex = Mutex()
    private val pendingFolderCallback = AtomicReference<String?>(null)
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @JavascriptInterface
    fun getStatus(callbackId: String) {
        val callback = BridgeSafe.callbackId(callbackId) ?: return
        resolveStatus(callback)
    }

    @JavascriptInterface
    fun chooseFolder(callbackId: String) {
        val callback = BridgeSafe.callbackId(callbackId) ?: return
        if (!pendingFolderCallback.compareAndSet(null, callback)) {
            resolve(callback, JSONObject().put("status", "error").put("message", "Folder selection is already open."))
            return
        }
        webView.post {
            runCatching { launchOpenTree() }.onFailure {
                pendingFolderCallback.compareAndSet(callback, null)
                resolve(callback, JSONObject().put("status", "error").put("message", "Could not open the folder picker."))
            }
        }
    }

    fun onFolderResult(uri: Uri?, flags: Int) {
        val callback = pendingFolderCallback.getAndSet(null) ?: return
        if (uri == null) {
            resolve(callback, JSONObject().put("status", "cancelled"))
            return
        }
        val permissionFlags = flags and
            (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        scope.launch {
            backupMutex.withLock {
                val previousUri = configuredUri()
                val error = runCatching {
                    context.contentResolver.takePersistableUriPermission(uri, permissionFlags)
                    if (!hasFolderPermission(uri)) error("Read/write permission was not retained")
                    prefs.edit()
                        .putString(KEY_FOLDER_URI, uri.toString())
                        .putString(KEY_FOLDER_NAME, displayName(uri) ?: "Selected folder")
                        .remove(KEY_LAST_ERROR)
                        .apply()
                    if (previousUri != null && previousUri != uri) releasePermission(previousUri)
                }.exceptionOrNull()
                if (error != null) {
                    resolve(callback, JSONObject().put("status", "error").put("message", "Helyx could not retain access to that folder."))
                } else {
                    resolveStatus(callback, "configured")
                }
            }
        }
    }

    @JavascriptInterface
    fun writeAutomaticBackup(content: String, dayKey: String, weekKey: String, reason: String, callbackId: String) {
        val callback = BridgeSafe.callbackId(callbackId) ?: return
        val request = AutoBackupSafe.request(content, dayKey, weekKey, reason, callback)
        if (request == null) {
            resolve(callback, JSONObject().put("status", "error").put("message", "Invalid automatic backup request."))
            return
        }
        scope.launch {
            backupMutex.withLock {
                val folder = configuredUri()
                if (folder == null) {
                    resolve(callback, JSONObject().put("status", "not-configured").put("configured", false))
                    return@withLock
                }
                val result = runCatching { writeBackup(folder, request) }
                result.onSuccess { details ->
                    val now = Instant.now().toString()
                    prefs.edit()
                        .putString(KEY_LAST_AT, now)
                        .putString(KEY_LAST_DAY, request.dayKey)
                        .remove(KEY_LAST_ERROR)
                        .apply()
                    resolve(callback, JSONObject().apply {
                        put("status", "saved")
                        put("configured", true)
                        put("filename", AutoBackupSafe.LATEST_NAME)
                        put("lastBackupAt", now)
                        put("lastBackupDay", request.dayKey)
                        put("dailyCount", details.dailyCount)
                        put("weeklyCount", details.weeklyCount)
                        if (details.pruneWarning) put("message", "Backup saved; some older files could not be removed.")
                    })
                }.onFailure {
                    prefs.edit().putString(KEY_LAST_ERROR, "The last automatic backup could not be written.").apply()
                    resolve(callback, JSONObject().put("status", "error").put("configured", true)
                        .put("message", "Could not write the automatic backup."))
                }
            }
        }
    }

    @JavascriptInterface
    fun disable(callbackId: String) {
        val callback = BridgeSafe.callbackId(callbackId) ?: return
        scope.launch {
            backupMutex.withLock {
                configuredUri()?.let(::releasePermission)
                prefs.edit().clear().apply()
                resolve(callback, JSONObject().put("status", "disabled").put("configured", false))
            }
        }
    }

    private data class WriteDetails(val dailyCount: Int, val weeklyCount: Int, val pruneWarning: Boolean)
    private data class Child(val uri: Uri, val name: String)

    private fun writeBackup(folder: Uri, request: AutoBackupSafe.Request): WriteDetails {
        val names = AutoBackupSafe.names(request.dayKey, request.weekKey)
        val children = listChildren(folder).associateBy { it.name }.toMutableMap()
        val bytes = request.content.toByteArray(Charsets.UTF_8)
        // Keep the prior latest file intact until both rotating snapshots are
        // safely written. If Android kills the process mid-write, at least one
        // complete generation therefore remains recoverable.
        listOf(names.daily, names.weekly, names.latest).forEach { name ->
            writeNamed(folder, children, name, bytes)
        }

        var pruneWarning = false
        val toDelete = AutoBackupSafe.namesToDelete(children.keys)
        toDelete.forEach { name ->
            val child = children[name] ?: return@forEach
            val deleted = runCatching { DocumentsContract.deleteDocument(context.contentResolver, child.uri) }
                .getOrDefault(false)
            if (deleted) children.remove(name) else pruneWarning = true
        }
        val dailyCount = children.keys.count { Regex("^helyx-auto-\\d{4}-\\d{2}-\\d{2}\\.json$").matches(it) }
        val weeklyCount = children.keys.count { Regex("^helyx-auto-week-\\d{4}-\\d{2}-\\d{2}\\.json$").matches(it) }
        return WriteDetails(dailyCount, weeklyCount, pruneWarning)
    }

    private fun writeNamed(folder: Uri, children: MutableMap<String, Child>, name: String, content: ByteArray) {
        val parentId = DocumentsContract.getTreeDocumentId(folder)
        val parent = DocumentsContract.buildDocumentUriUsingTree(folder, parentId)
        val uri = children[name]?.uri ?: DocumentsContract.createDocument(
            context.contentResolver,
            parent,
            "application/json",
            name,
        )?.also { children[name] = Child(it, name) } ?: error("Document could not be created")
        context.contentResolver.openOutputStream(uri, "wt")?.use { stream ->
            stream.write(content)
            stream.flush()
        } ?: error("Document output stream unavailable")
    }

    private fun listChildren(folder: Uri): List<Child> {
        val parentId = DocumentsContract.getTreeDocumentId(folder)
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(folder, parentId)
        val result = mutableListOf<Child>()
        context.contentResolver.query(
            childrenUri,
            arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME),
            null,
            null,
            null,
        )?.use { cursor ->
            val idColumn = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
            val nameColumn = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            while (cursor.moveToNext()) {
                val id = cursor.getString(idColumn)
                val name = cursor.getString(nameColumn) ?: continue
                result += Child(DocumentsContract.buildDocumentUriUsingTree(folder, id), name)
            }
        }
        return result
    }

    private fun configuredUri(): Uri? {
        val text = prefs.getString(KEY_FOLDER_URI, null) ?: return null
        val uri = runCatching { Uri.parse(text) }.getOrNull() ?: return null
        if (hasFolderPermission(uri)) return uri
        prefs.edit().remove(KEY_FOLDER_URI).remove(KEY_FOLDER_NAME).apply()
        return null
    }

    private fun hasFolderPermission(uri: Uri): Boolean = context.contentResolver.persistedUriPermissions
        .any { it.uri == uri && it.isReadPermission && it.isWritePermission }

    private fun releasePermission(uri: Uri) {
        runCatching {
            context.contentResolver.releasePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
        }
    }

    private fun displayName(uri: Uri): String? = runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    }.getOrNull()

    private fun resolveStatus(callbackId: String, status: String = "ready") {
        val configured = configuredUri() != null
        resolve(callbackId, JSONObject().apply {
            put("status", status)
            put("available", true)
            put("configured", configured)
            if (configured) put("folderName", prefs.getString(KEY_FOLDER_NAME, "Selected folder"))
            prefs.getString(KEY_LAST_AT, null)?.let { put("lastBackupAt", it) }
            prefs.getString(KEY_LAST_DAY, null)?.let { put("lastBackupDay", it) }
            prefs.getString(KEY_LAST_ERROR, null)?.let { put("lastError", it) }
        })
    }

    private fun resolve(callbackId: String, payload: JSONObject) {
        val script = AutoBackupSafe.callbackScript(callbackId, payload.toString()) ?: return
        webView.post { webView.evaluateJavascript(script, null) }
    }

    private companion object {
        const val PREFS = "helyx_auto_backup"
        const val KEY_FOLDER_URI = "folder_uri"
        const val KEY_FOLDER_NAME = "folder_name"
        const val KEY_LAST_AT = "last_backup_at"
        const val KEY_LAST_DAY = "last_backup_day"
        const val KEY_LAST_ERROR = "last_error"
    }
}
