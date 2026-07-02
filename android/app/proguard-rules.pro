# Keep @JavascriptInterface methods on ANY class — R8 would otherwise strip or
# rename them, silently breaking the JS<->native bridges (HybridHealthBridge,
# HybridGpsBridge, HybridNotifyBridge) in release builds only.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Health Connect
-keep class androidx.health.connect.** { *; }
