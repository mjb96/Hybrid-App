package com.helyx.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies the native half of the Health Connect supported-field contract stays
 * in lockstep with js/health/health-fields.js: the same four field ids, and a
 * selection that drives EXACTLY the permissions requested — never a field the
 * user did not select (R14).
 */
class HealthFieldContractTest {

    @Test
    fun contractIsExactlyTheFourSupportedFields() {
        assertEquals(listOf("steps", "restingHR", "hrv", "sleep"), HealthFieldContract.ALL_FIELDS)
        assertFalse(HealthFieldContract.isSupported("vo2max"))
        assertFalse(HealthFieldContract.isSupported("weight"))
        assertTrue(HealthFieldContract.isSupported("steps"))
    }

    @Test
    fun sanitizeDropsUnsupportedButKeepsOrder() {
        assertEquals(listOf("steps", "hrv"), HealthFieldContract.sanitize(listOf("steps", "vo2max", "hrv", "bogus")))
        assertEquals(emptyList<String>(), HealthFieldContract.sanitize(listOf("vo2max")))
    }

    @Test
    fun permissionsForFieldsRequestOnlySelectedPlusHistory() {
        val perms = HealthFieldContract.permissionsForFields(listOf("steps", "hrv"))
        assertEquals(
            setOf(
                "android.permission.health.READ_STEPS",
                "android.permission.health.READ_HEART_RATE_VARIABILITY",
                HealthFieldContract.HISTORY_PERMISSION,
            ),
            perms,
        )
        // A field the user did NOT select must not appear.
        assertFalse(perms.contains("android.permission.health.READ_SLEEP"))
        assertFalse(perms.contains("android.permission.health.READ_RESTING_HEART_RATE"))
    }

    @Test
    fun emptyOrUnsupportedSelectionRequestsNothing() {
        assertTrue(HealthFieldContract.permissionsForFields(emptyList()).isEmpty())
        assertTrue(HealthFieldContract.permissionsForFields(listOf("vo2max")).isEmpty())
    }

    @Test
    fun grantedFieldsMapsPermissionStringsBackToIds() {
        val granted = setOf(
            "android.permission.health.READ_STEPS",
            "android.permission.health.READ_SLEEP",
            HealthFieldContract.HISTORY_PERMISSION,
        )
        assertEquals(listOf("steps", "sleep"), HealthFieldContract.grantedFields(granted))
        // Revocation → the shrinking granted set drops the field.
        assertEquals(listOf("steps"), HealthFieldContract.grantedFields(setOf("android.permission.health.READ_STEPS")))
        assertEquals(emptyList<String>(), HealthFieldContract.grantedFields(emptySet()))
    }

    @Test
    fun allPermissionsCoversEveryFieldPlusHistory() {
        val all = HealthFieldContract.ALL_PERMISSIONS
        assertTrue(all.contains(HealthFieldContract.HISTORY_PERMISSION))
        for (perm in HealthFieldContract.FIELD_PERMISSION.values) assertTrue(all.contains(perm))
        assertEquals(HealthFieldContract.FIELD_PERMISSION.size + 1, all.size)
    }
}
