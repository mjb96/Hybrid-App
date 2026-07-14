package com.helyx.app

import android.content.Context
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicReference

/**
 * Android Storage Access Framework adapter for JSON/CSV exports.
 * JavaScript receives a result only after the selected Uri was written, or an
 * explicit cancellation/error. At most one picker can be active at a time.
 */
class FileExportBridge(
    private val context: Context,
    private val webView: WebView,
    private val launchCreateDocument: (filename: String, mime: String) -> Unit,
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val pending = AtomicReference<ExportSafe.Request?>()

    @JavascriptInterface
    fun saveTextFile(filename: String, content: String, mime: String, callbackId: String) {
        val safeCallback = BridgeSafe.callbackId(callbackId) ?: return
        val request = ExportSafe.request(filename, content, mime, safeCallback)
        if (request == null) {
            resolve(safeCallback, "error", null, "Invalid export request.")
            return
        }
        enqueue(request)
    }

    /** Compatibility path for old data: download links handled by MainActivity. */
    fun saveFromDownload(filename: String, content: String, mime: String) {
        val request = ExportSafe.request(filename, content, mime, null)
        if (request == null) {
            Toast.makeText(context, "Export could not be opened", Toast.LENGTH_SHORT).show()
            return
        }
        enqueue(request)
    }

    private fun enqueue(request: ExportSafe.Request) {
        webView.post {
            if (!pending.compareAndSet(null, request)) {
                complete(request, "error", "Another export is already open.")
                return@post
            }
            runCatching { launchCreateDocument(request.filename, request.mime) }
                .onFailure {
                    pending.compareAndSet(request, null)
                    complete(request, "error", "Could not open the save dialog.")
                }
        }
    }

    /** Called by MainActivity when ACTION_CREATE_DOCUMENT returns. */
    fun onDocumentResult(uri: Uri?) {
        val request = pending.getAndSet(null) ?: return
        if (uri == null) {
            complete(request, "cancelled", null)
            return
        }
        scope.launch {
            val error = runCatching {
                context.contentResolver.openOutputStream(uri, "wt")?.use {
                    it.write(request.content.toByteArray(Charsets.UTF_8))
                } ?: error("Output stream unavailable")
            }.exceptionOrNull()
            if (error == null) complete(request, "saved", null)
            else complete(request, "error", "Could not write the selected file.")
        }
    }

    private fun complete(request: ExportSafe.Request, status: String, message: String?) {
        if (request.callbackId == null) {
            webView.post {
                val text = when (status) {
                    "saved" -> "Export saved"
                    "cancelled" -> "Export cancelled"
                    else -> message ?: "Export failed"
                }
                Toast.makeText(context, text, Toast.LENGTH_SHORT).show()
            }
            return
        }
        resolve(request.callbackId, status, request.filename, message)
    }

    private fun resolve(callbackId: String, status: String, filename: String?, message: String?) {
        val payload = JSONObject().apply {
            put("status", status)
            if (filename != null) put("filename", filename)
            if (message != null) put("message", message)
        }.toString()
        val script = ExportSafe.callbackScript(callbackId, payload) ?: return
        webView.post { webView.evaluateJavascript(script, null) }
    }
}
