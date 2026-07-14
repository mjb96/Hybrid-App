package com.helyx.app

/**
 * The native half of the Health Connect supported-field contract.
 *
 * Mirrors js/health/health-fields.js EXACTLY: the same field-id vocabulary
 * ("steps" | "restingHR" | "hrv" | "sleep") is used verbatim on both sides so
 * the JS selection maps 1:1 to Health Connect permissions and record reads. A
 * field belongs here only if it has a complete end-to-end path; VO₂ max is
 * intentionally absent (no ingestion path).
 *
 * Pure and free of Android/Health-Connect runtime types so it is unit-testable
 * on the JVM. The permission strings are the exact values returned by
 * androidx.health.connect.client HealthPermission.getReadPermission(...) for the
 * corresponding record types, and must match android/app/src/main/AndroidManifest.xml.
 */
object HealthFieldContract {

    /** Enables reading records older than 30 days; requested alongside the field
     *  permissions and degrades gracefully (older records simply omitted) if denied. */
    const val HISTORY_PERMISSION = "android.permission.health.READ_HEALTH_DATA_HISTORY"

    /** Field id (shared with JS) → Health Connect read permission. Insertion order
     *  is the canonical field order. */
    val FIELD_PERMISSION: Map<String, String> = linkedMapOf(
        "steps"     to "android.permission.health.READ_STEPS",
        "restingHR" to "android.permission.health.READ_RESTING_HEART_RATE",
        "hrv"       to "android.permission.health.READ_HEART_RATE_VARIABILITY",
        "sleep"     to "android.permission.health.READ_SLEEP",
    )

    /** Every supported field id, in canonical order. */
    val ALL_FIELDS: List<String> get() = FIELD_PERMISSION.keys.toList()

    /** Every permission the app may ever request (field reads + history). */
    val ALL_PERMISSIONS: Set<String> get() = FIELD_PERMISSION.values.toSet() + HISTORY_PERMISSION

    fun isSupported(id: String): Boolean = FIELD_PERMISSION.containsKey(id)

    /** The supported subset of the requested ids, preserving request order. */
    fun sanitize(ids: Collection<String>): List<String> = ids.filter { isSupported(it) }

    /**
     * The permissions to request for the given selected fields — EXACTLY those
     * fields' read permissions, plus history when at least one field is selected.
     * Returns an empty set for an empty/unsupported selection so the caller can
     * avoid launching an empty permission request.
     */
    fun permissionsForFields(ids: Collection<String>): Set<String> {
        val selected = sanitize(ids)
        if (selected.isEmpty()) return emptySet()
        val perms = selected.mapNotNull { FIELD_PERMISSION[it] }.toMutableSet()
        perms.add(HISTORY_PERMISSION)
        return perms
    }

    /** The field ids currently granted, given a set of granted permission strings. */
    fun grantedFields(grantedPermissions: Set<String>): List<String> =
        FIELD_PERMISSION.entries.filter { it.value in grantedPermissions }.map { it.key }
}
