package com.helyx.app

import org.junit.Assert.assertArrayEquals
import org.junit.Test

class FileChooserTypesTest {
    @Test
    fun jsonExtensionBecomesAndroidMimeType() {
        assertArrayEquals(
            arrayOf("application/json"),
            FileChooserTypes.normalize(arrayOf(".json")),
        )
    }

    @Test
    fun commaSeparatedJsonFiltersAreSplitAndDeduplicated() {
        assertArrayEquals(
            arrayOf("application/json"),
            FileChooserTypes.normalize(arrayOf(".json,application/json")),
        )
    }

    @Test
    fun fitExtensionCoversRegisteredAndGenericBinaryProviders() {
        assertArrayEquals(
            arrayOf("application/vnd.ant.fit", "application/octet-stream"),
            FileChooserTypes.normalize(arrayOf(".fit")),
        )
    }

    @Test
    fun validMimeWildcardsPassThrough() {
        assertArrayEquals(
            arrayOf("image/*"),
            FileChooserTypes.normalize(arrayOf("image/*")),
        )
    }

    @Test
    fun emptyOrUnknownFiltersFailOpenToThePicker() {
        assertArrayEquals(arrayOf("*/*"), FileChooserTypes.normalize(emptyArray()))
        assertArrayEquals(arrayOf("*/*"), FileChooserTypes.normalize(arrayOf(".unknown")))
    }
}
