package com.helyx.app

import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.content.pm.PackageManager
import android.webkit.GeolocationPermissions
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.net.URLDecoder
import java.util.Locale
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var bridge: HybridHealthBridge
    private lateinit var gpsBridge: GpsBridge
    private lateinit var notifBridge: NotifyBridge
    private lateinit var fileExportBridge: FileExportBridge
    private lateinit var autoBackupBridge: AutoBackupBridge

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var lastBackPressTime = 0L

    /**
     * Latest top inset (status bar / display cutout) in CSS pixels, published to
     * the web layer as `--app-safe-top`. Held so a page that finishes loading
     * AFTER the inset arrived still gets the current value — the insets listener
     * generally fires before first paint.
     *
     * This exists because `env(safe-area-inset-top)` is NOT sufficient here: the
     * activity is edge-to-edge (setDecorFitsSystemWindows(false)), but Android
     * WebView only reports a non-zero top safe-area inset for a DISPLAY CUTOUT,
     * not for the status bar. On a device with no notch it stays 0px, so CSS
     * alone cannot know how far down the content must start.
     */
    private var safeTopCssPx = 0f

    // Pending geolocation permission callback — held while the OS permission dialog is shown.
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null
    private var pendingGeoOrigin: String? = null

    private val requestLocationPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val cb     = pendingGeoCallback
        val origin = pendingGeoOrigin
        pendingGeoCallback = null
        pendingGeoOrigin   = null
        cb?.invoke(origin, granted, false)
        // The GPS bridge may also be waiting on this dialog (no-op when not).
        gpsBridge.onPermissionResult(granted)
    }

    // Must be registered before onStart(); PermissionController contract is static.
    private val requestPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted: Set<String> ->
        bridge.onPermissionResult(granted)
    }

    private val openDocumentLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        val cb = fileChooserCallback
        fileChooserCallback = null
        cb?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
    }

    private val createExportDocumentLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        fileExportBridge.onDocumentResult(
            if (result.resultCode == Activity.RESULT_OK) result.data?.data else null
        )
    }

    private val openBackupDirectoryLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        autoBackupBridge.onFolderResult(
            if (result.resultCode == Activity.RESULT_OK) result.data?.data else null,
            result.data?.flags ?: 0,
        )
    }

    private val requestNotifPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        // Resolve a pending web request for reminder permission (no-op when the
        // dialog was triggered by the rest timer, which doesn't await a result).
        notifBridge.onPermissionResult(granted)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        // Edge-to-edge: WebView draws behind status/navigation bars.
        WindowCompat.setDecorFitsSystemWindows(window, false)

        setContentView(R.layout.activity_main)
        createNotificationChannels()

        webView = findViewById(R.id.webView)
        gpsBridge = GpsBridge(
            context = this,
            webView = webView,
            requestLocationPermission = {
                requestLocationPermLauncher.launch(android.Manifest.permission.ACCESS_FINE_LOCATION)
            },
        )
        bridge = HybridHealthBridge(
            context = this,
            webView = webView,
            launchPermissions = { permissions -> requestPermissions.launch(permissions) },
            requestNotificationPermission = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    requestNotifPermLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                }
            },
        )
        notifBridge = NotifyBridge(
            context = this,
            webView = webView,
            requestOsPermission = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    requestNotifPermLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    // Pre-13: no runtime permission, resolve immediately as granted.
                    notifBridge.onPermissionResult(true)
                }
            },
        )
        fileExportBridge = FileExportBridge(
            context = this,
            webView = webView,
            launchCreateDocument = { filename, mime ->
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = mime
                    putExtra(Intent.EXTRA_TITLE, filename)
                }
                createExportDocumentLauncher.launch(intent)
            },
        )
        autoBackupBridge = AutoBackupBridge(
            context = this,
            webView = webView,
            launchOpenTree = {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                    addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
                    addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
                }
                openBackupDirectoryLauncher.launch(intent)
            },
        )

        configureWebView()
        installSafeAreaBridge()
        // Registers OnBackPressedCallback for API 26+. AndroidX activity:1.8+ automatically
        // bridges this to OnBackInvokedCallback on API 33+ when
        // android:enableOnBackInvokedCallback="true" is set in the manifest, giving full
        // predictive-back gesture support without duplicate registration.
        registerBackHandler()
        scheduleHealthSync()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        webView.pauseTimers()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        // Remote WebView debugging (chrome://inspect) is a release-time attack
        // surface — enable it ONLY in debuggable builds.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        webView.apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.setGeolocationEnabled(true)
            // allowFileAccess flags are no longer needed: assets are served over
            // https://appassets.androidplatform.net via WebViewAssetLoader.
            settings.allowFileAccessFromFileURLs = false
            settings.allowUniversalAccessFromFileURLs = false
            // Accessibility: allow pinch-zoom (low-vision users) — the viewport
            // already permits it. displayZoomControls(false) hides the legacy
            // on-screen +/- buttons so only the gesture is enabled.
            settings.builtInZoomControls = true
            settings.displayZoomControls = false
            settings.setSupportZoom(true)
            overScrollMode = WebView.OVER_SCROLL_NEVER

            webViewClient = AppWebViewClient(assetLoader)
            webChromeClient = AppWebChromeClient()

            setDownloadListener { url, _, contentDisposition, mimetype, _ ->
                handleDownload(url, contentDisposition, mimetype)
            }

            addJavascriptInterface(bridge, "HybridHealthBridge")
            addJavascriptInterface(gpsBridge, "HybridGpsBridge")
            addJavascriptInterface(notifBridge, "HybridNotifyBridge")
            addJavascriptInterface(fileExportBridge, "HybridFileExportBridge")
            addJavascriptInterface(autoBackupBridge, "HybridAutoBackupBridge")
            loadUrl(BuildConfig.APP_URL)
        }
    }

    private fun handleDownload(url: String, contentDisposition: String?, mimetype: String?) {
        when {
            url.startsWith("data:") -> {
                val commaIdx = url.indexOf(',')
                if (commaIdx < 0) return
                val meta = url.substring(5, commaIdx)
                val mimeType = meta.substringBefore(';').ifBlank { mimetype ?: "application/octet-stream" }
                val filename = URLUtil.guessFileName(url, contentDisposition, mimeType)
                    .ifBlank { if (mimeType.contains("json")) "export.json" else "export.csv" }
                val content = try {
                    if (meta.endsWith(";base64")) {
                        android.util.Base64.decode(url.substring(commaIdx + 1), android.util.Base64.DEFAULT)
                            .toString(Charsets.UTF_8)
                    } else {
                        URLDecoder.decode(url.substring(commaIdx + 1), "UTF-8")
                    }
                } catch (_: Exception) { return }
                fileExportBridge.saveFromDownload(filename, content, mimeType)
            }
            url.startsWith("http://") || url.startsWith("https://") -> {
                val filename = URLUtil.guessFileName(url, contentDisposition, mimetype)
                val req = DownloadManager.Request(Uri.parse(url)).apply {
                    setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                    )
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                }
                (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
            }
        }
    }

    /**
     * Publishes the real top system inset to CSS as `--app-safe-top`.
     *
     * Re-fires on rotation and on any inset change, so portrait/landscape both
     * stay correct. The listener returns the insets unconsumed so nothing else
     * in the view tree is starved of them.
     */
    private fun installSafeAreaBridge() {
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            val top = insets.getInsets(
                WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout()
            ).top
            val density = resources.displayMetrics.density.takeIf { it > 0f } ?: 1f
            val cssPx = top / density
            if (cssPx != safeTopCssPx) {
                safeTopCssPx = cssPx
                applySafeTopToDocument()
            }
            insets
        }
    }

    /**
     * Sets `--app-safe-top` on the document element. Formatted with Locale.US so
     * a comma-decimal locale can't emit an invalid CSS length ("24,5px").
     */
    private fun applySafeTopToDocument() {
        val value = String.format(Locale.US, "%.2fpx", safeTopCssPx)
        webView.evaluateJavascript(
            "document.documentElement.style.setProperty('--app-safe-top', '$value');",
            null,
        )
    }

    private fun registerBackHandler() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(
                    "(window.__onAndroidBack ? window.__onAndroidBack() : 'exit')"
                ) { result ->
                    if (result?.trim('"') != "handled") handleExit()
                }
            }
        })
    }

    private fun handleExit() {
        val now = System.currentTimeMillis()
        if (now - lastBackPressTime < 2000L) {
            finish()
        } else {
            Toast.makeText(this, "Press back again to exit", Toast.LENGTH_SHORT).show()
            lastBackPressTime = now
        }
    }

    private fun createNotificationChannels() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(
                HybridHealthBridge.NOTIFICATION_CHANNEL_ID,
                "Rest Timer",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Notifies when a rest period ends during a backgrounded session"
            }
        )
        GpsTrackingService.createChannel(this)
        NotifyBridge.createChannel(this)
    }

    private fun scheduleHealthSync() {
        if (HealthConnectClient.getSdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) return
        val req = PeriodicWorkRequestBuilder<HealthSyncWorker>(8, TimeUnit.HOURS)
            .setInitialDelay(8, TimeUnit.HOURS)
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            HealthSyncWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            req,
        )
    }

    private inner class AppWebViewClient(
        private val assetLoader: WebViewAssetLoader,
    ) : WebViewClientCompat() {

        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest,
        ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

        override fun onPageFinished(view: WebView, url: String) {
            // The insets listener usually fires before there is a document to set
            // the property on, so republish the current value once the page exists.
            applySafeTopToDocument()
        }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            // Stay in-app ONLY for the exact privileged origin (parsed, not prefix-
            // matched, so lookalike hosts can't sneak into the bridged WebView).
            if (TrustedOrigin.isTrusted(uri.toString())) return false
            // Everything else is untrusted: hand it to the system browser so it can
            // never execute inside the WebView that owns the native bridges.
            openExternally(uri)
            return true
        }
    }

    /**
     * Opens an untrusted http/https link in the system browser via an explicit
     * intent. Non-web schemes (intent:, custom app schemes, javascript:, …) are
     * dropped rather than forwarded — the privileged app must not be a redirector
     * for arbitrary schemes. Fails safe when no browser is installed.
     */
    private fun openExternally(uri: Uri) {
        val scheme = TrustedOrigin.schemeOf(uri.toString())
        if (scheme != "http" && scheme != "https") return
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            startActivity(intent)
        } catch (_: android.content.ActivityNotFoundException) {
            Toast.makeText(this, "No app found to open this link", Toast.LENGTH_SHORT).show()
        }
    }

    private inner class AppWebChromeClient : WebChromeClient() {
        override fun onGeolocationPermissionsShowPrompt(
            origin: String,
            callback: GeolocationPermissions.Callback,
        ) {
            // Only the exact app origin may ever be granted geolocation. A framed
            // or navigated-to third-party page requesting location is rejected
            // outright — never prompt the user on its behalf. (The WebView also
            // blocks off-origin navigation, but this is defence in depth: the
            // origin the callback carries is authoritative here.)
            if (!TrustedOrigin.isTrusted(origin)) {
                callback.invoke(origin, false, false)
                return
            }

            val hasPermission = ContextCompat.checkSelfPermission(
                this@MainActivity,
                android.Manifest.permission.ACCESS_FINE_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED

            if (hasPermission) {
                callback.invoke(origin, true, false)
            } else {
                pendingGeoCallback = callback
                pendingGeoOrigin   = origin
                requestLocationPermLauncher.launch(android.Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: WebChromeClient.FileChooserParams,
        ): Boolean {
            // Cancel any pending callback to avoid locking the input element.
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = filePathCallback

            val types = FileChooserTypes.normalize(fileChooserParams.acceptTypes)
            openDocumentLauncher.launch(types)
            return true
        }
    }

}
