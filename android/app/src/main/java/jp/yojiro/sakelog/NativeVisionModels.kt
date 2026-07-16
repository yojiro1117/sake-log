package jp.yojiro.sakelog

import android.graphics.Bitmap
import android.graphics.Rect
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

object NativeVisionModels {
    fun normalizedRect(rect: Rect, width: Int, height: Int): JSObject = JSObject().apply {
        put("x", rect.left.toDouble() / width)
        put("y", rect.top.toDouble() / height)
        put("width", rect.width().toDouble() / width)
        put("height", rect.height().toDouble() / height)
    }

    fun detectLabelRegions(bitmap: Bitmap): List<Rect> {
        val sampleWidth = min(bitmap.width, 360)
        val sampleHeight = max(1, bitmap.height * sampleWidth / bitmap.width)
        val sample = Bitmap.createScaledBitmap(bitmap, sampleWidth, sampleHeight, true)
        var left = sampleWidth
        var top = sampleHeight
        var right = 0
        var bottom = 0
        val xStart = sampleWidth / 8
        val xEnd = sampleWidth * 7 / 8
        val yStart = sampleHeight / 8
        val yEnd = sampleHeight * 7 / 8
        for (y in yStart + 1 until yEnd - 1 step 2) {
            for (x in xStart + 1 until xEnd - 1 step 2) {
                val center = luma(sample.getPixel(x, y))
                val gradient = abs(center - luma(sample.getPixel(x + 1, y))) + abs(center - luma(sample.getPixel(x, y + 1)))
                if (gradient > 46) {
                    left = min(left, x); right = max(right, x)
                    top = min(top, y); bottom = max(bottom, y)
                }
            }
        }
        if (sample !== bitmap) sample.recycle()
        val scaleX = bitmap.width.toDouble() / sampleWidth
        val scaleY = bitmap.height.toDouble() / sampleHeight
        val detected = if (right > left && bottom > top) Rect(
            (left * scaleX).toInt(), (top * scaleY).toInt(),
            ((right + 1) * scaleX).toInt(), ((bottom + 1) * scaleY).toInt()
        ) else Rect(bitmap.width / 6, bitmap.height / 5, bitmap.width * 5 / 6, bitmap.height * 4 / 5)
        return listOf(expand(detected, bitmap.width, bitmap.height, 0.08))
    }

    fun embedding(bitmap: Bitmap): DoubleArray {
        val sample = Bitmap.createScaledBitmap(bitmap, 16, 16, true)
        val values = DoubleArray(64)
        for (by in 0 until 8) for (bx in 0 until 8) {
            var total = 0.0
            for (y in 0 until 2) for (x in 0 until 2) total += luma(sample.getPixel(bx * 2 + x, by * 2 + y)) / 255.0
            values[by * 8 + bx] = total / 4.0
        }
        sample.recycle()
        return values
    }

    fun similarity(left: DoubleArray, right: DoubleArray): Pair<Double, Double> {
        var square = 0.0
        for (index in left.indices) square += (left[index] - right[index]) * (left[index] - right[index])
        val distance = sqrt(square / max(1, left.size))
        return distance to max(0.0, 1.0 - distance)
    }

    fun toArray(values: DoubleArray): JSArray = JSArray().apply { values.forEach { put(it) } }

    private fun expand(rect: Rect, width: Int, height: Int, ratio: Double): Rect {
        val dx = (rect.width() * ratio).toInt()
        val dy = (rect.height() * ratio).toInt()
        return Rect(max(0, rect.left - dx), max(0, rect.top - dy), min(width, rect.right + dx), min(height, rect.bottom + dy))
    }

    private fun luma(color: Int): Int {
        val red = color shr 16 and 0xff
        val green = color shr 8 and 0xff
        val blue = color and 0xff
        return (red * 299 + green * 587 + blue * 114) / 1000
    }
}
