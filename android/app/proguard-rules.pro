# Keep JavascriptInterface methods — R8 would strip them otherwise
-keepclassmembers class com.helyx.app.HybridHealthBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Health Connect
-keep class androidx.health.connect.** { *; }
