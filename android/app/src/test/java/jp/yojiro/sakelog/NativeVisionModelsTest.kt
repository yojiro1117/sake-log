package jp.yojiro.sakelog

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeVisionModelsTest {
    @Test
    fun identicalEmbeddingsHaveFullSimilarity() {
        val result = NativeVisionModels.similarity(doubleArrayOf(0.1, 0.5, 0.9), doubleArrayOf(0.1, 0.5, 0.9))
        assertEquals(0.0, result.first, 0.0001)
        assertEquals(1.0, result.second, 0.0001)
    }

    @Test
    fun differentEmbeddingsDoNotExceedFullSimilarity() {
        val result = NativeVisionModels.similarity(doubleArrayOf(0.0, 0.0), doubleArrayOf(1.0, 1.0))
        assertTrue(result.second in 0.0..1.0)
    }
}
