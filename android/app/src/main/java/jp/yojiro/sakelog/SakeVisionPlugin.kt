package jp.yojiro.sakelog

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import java.util.Collections
import java.util.concurrent.Executors

@CapacitorPlugin(name = "SakeVision")
class SakeVisionPlugin : Plugin() {
    private val executor = Executors.newSingleThreadExecutor()
    private val cancelled = Collections.synchronizedSet(mutableSetOf<String>())

    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        val power = context.getSystemService(PowerManager::class.java)
        val battery = context.getSystemService(BatteryManager::class.java)
        call.resolve(JSObject().apply {
            put("environment", "android-native")
            put("platform", "Android")
            put("osVersion", Build.VERSION.RELEASE)
            put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
            put("ocrEngine", "mlkit")
            put("barcodeEngine", "ML Kit Barcode Scanning 17.3.0")
            put("visualEngine", "sake-local-fingerprint-v1")
            put("modelVersion", "ML Kit Text Recognition 16.0.1 bundled")
            put("supportsLabelDetection", true)
            put("supportsTextRecognition", true)
            put("supportsBarcode", true)
            put("supportsVisualEmbedding", true)
            put("thermalState", if (Build.VERSION.SDK_INT >= 29) power.currentThermalStatus.toString() else "unavailable")
            put("batteryLevel", battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) / 100.0)
        })
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        call.getString("signalId")?.let { cancelled.add(it) }
        call.resolve()
    }

    @PluginMethod
    fun detectLabelRegions(call: PluginCall) = withBitmap(call) { bitmap, started ->
        JSObject().apply {
            put("regions", regionArray(bitmap))
            put("processingTimeMs", elapsed(started))
        }
    }

    @PluginMethod
    fun recognizeText(call: PluginCall) = withBitmap(call) { bitmap, started ->
        val observations = recognize(bitmap, call.getString("signalId"))
        JSObject().apply {
            put("observations", observations)
            put("processingTimeMs", elapsed(started))
            put("engine", "mlkit")
        }
    }

    @PluginMethod
    fun readBarcodes(call: PluginCall) = withBitmap(call) { bitmap, started ->
        JSObject().apply {
            put("observations", barcodes(bitmap))
            put("processingTimeMs", elapsed(started))
        }
    }

    @PluginMethod
    fun createImageEmbedding(call: PluginCall) = withBitmap(call) { bitmap, started ->
        val values = NativeVisionModels.embedding(bitmap)
        JSObject().apply {
            put("values", NativeVisionModels.toArray(values))
            put("model", "sake-local-fingerprint-v1")
            put("dimensions", values.size)
            put("processingTimeMs", elapsed(started))
        }
    }

    @PluginMethod
    fun compareImages(call: PluginCall) {
        executor.execute {
            try {
                val left = loadBitmap(call.getString("firstFileUri") ?: error("firstFileUri is required"))
                val right = loadBitmap(call.getString("secondFileUri") ?: error("secondFileUri is required"))
                val result = NativeVisionModels.similarity(NativeVisionModels.embedding(left), NativeVisionModels.embedding(right))
                left.recycle(); right.recycle()
                call.resolve(JSObject().apply { put("distance", result.first); put("similarity", result.second); put("model", "sake-local-fingerprint-v1") })
            } catch (error: Exception) { call.reject("画像特徴を比較できませんでした。", error) }
        }
    }

    @PluginMethod
    fun analyzeImage(call: PluginCall) = withBitmap(call) { bitmap, started ->
        val signalId = call.getString("signalId")
        if (signalId != null && cancelled.contains(signalId)) error("CANCELLED")
        val labels = regionArray(bitmap)
        val text = recognize(bitmap, signalId)
        if (signalId != null && cancelled.contains(signalId)) error("CANCELLED")
        JSObject().apply {
            put("textObservations", text)
            put("barcodeObservations", barcodes(bitmap))
            put("labelRegions", labels)
            put("visualEmbedding", JSObject().apply {
                val values = NativeVisionModels.embedding(bitmap)
                put("values", NativeVisionModels.toArray(values)); put("model", "sake-local-fingerprint-v1"); put("dimensions", values.size)
            })
            put("imageQuality", JSObject().apply {
                put("blurScore", 0.5); put("brightnessScore", 0.5); put("glareScore", 0.0)
                put("labelCoverage", if (labels.length() > 0) 0.4 else 0.0); put("warnings", JSArray())
            })
            put("processingTimeMs", elapsed(started))
            put("warnings", JSArray())
        }
    }

    private fun recognize(bitmap: Bitmap, signalId: String?): JSArray {
        val regions = NativeVisionModels.detectLabelRegions(bitmap)
        val passes = regions.mapIndexed { index, rect -> Bitmap.createBitmap(bitmap, rect.left, rect.top, rect.width(), rect.height()) to "label-$index" } + listOf(bitmap to "full")
        val output = JSArray()
        val recognizers = listOf(
            "ja" to TextRecognition.getClient(JapaneseTextRecognizerOptions.Builder().build()),
            "latin" to TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        )
        try {
            passes.forEachIndexed { passIndex, (imageBitmap, passId) ->
                if (signalId != null && cancelled.contains(signalId)) error("CANCELLED")
                recognizers.forEach { (language, recognizer) ->
                    val result = Tasks.await(recognizer.process(InputImage.fromBitmap(imageBitmap, 0)))
                    appendText(output, result, bitmap.width, bitmap.height, if (passIndex < regions.size) "frontLabel" else "fullImage", "$passId-$language")
                }
                if (imageBitmap !== bitmap) imageBitmap.recycle()
            }
        } finally { recognizers.forEach { it.second.close() } }
        return output
    }

    private fun appendText(output: JSArray, text: Text, width: Int, height: Int, regionType: String, passId: String) {
        text.textBlocks.forEach { block -> block.lines.forEach { line -> line.elements.forEach { element ->
            val box = element.boundingBox ?: return@forEach
            output.put(JSObject().apply {
                put("text", element.text); put("confidence", element.confidence.toDouble())
                put("boundingBox", NativeVisionModels.normalizedRect(box, width, height))
                put("cornerPoints", JSArray()); put("language", element.recognizedLanguage)
                put("orientation", 0); put("regionType", regionType); put("engine", "mlkit"); put("passId", passId)
            })
        } } }
    }

    private fun barcodes(bitmap: Bitmap): JSArray {
        val options = BarcodeScannerOptions.Builder().setBarcodeFormats(
            Barcode.FORMAT_EAN_8, Barcode.FORMAT_EAN_13, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E,
            Barcode.FORMAT_CODE_128, Barcode.FORMAT_QR_CODE, Barcode.FORMAT_DATA_MATRIX
        ).build()
        val scanner = BarcodeScanning.getClient(options)
        return try {
            val values = Tasks.await(scanner.process(InputImage.fromBitmap(bitmap, 0)))
            JSArray().apply { values.forEach { barcode -> barcode.rawValue?.let { value -> put(JSObject().apply {
                put("rawValue", value); put("format", barcode.format.toString()); put("confidence", 1.0)
                barcode.boundingBox?.let { put("boundingBox", NativeVisionModels.normalizedRect(it, bitmap.width, bitmap.height)) }
            }) } } }
        } finally { scanner.close() }
    }

    private fun regionArray(bitmap: Bitmap): JSArray = JSArray().apply {
        NativeVisionModels.detectLabelRegions(bitmap).forEachIndexed { index, rect -> put(JSObject().apply {
            put("id", "android-region-$index"); put("boundingBox", NativeVisionModels.normalizedRect(rect, bitmap.width, bitmap.height))
            put("cornerPoints", JSArray()); put("confidence", 0.55); put("regionType", if (index == 0) "frontLabel" else "backLabel"); put("perspectiveCorrected", false)
        }) }
    }

    private fun withBitmap(call: PluginCall, operation: (Bitmap, Long) -> JSObject) {
        val uri = call.getString("localFileUri") ?: run { call.reject("localFileUri is required"); return }
        executor.execute {
            var bitmap: Bitmap? = null
            try {
                val started = System.nanoTime()
                bitmap = loadBitmap(uri)
                call.resolve(operation(bitmap, started))
            } catch (error: Exception) { call.reject(if (error.message == "CANCELLED") "画像解析をキャンセルしました。" else "画像解析に失敗しました。", error) }
            finally { bitmap?.recycle() }
        }
    }

    private fun loadBitmap(value: String): Bitmap {
        val uri = Uri.parse(value)
        return if (uri.scheme == "content") {
            context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it) ?: error("画像をデコードできませんでした") }
        } else {
            val path = if (uri.scheme == "file") uri.path else value
            BitmapFactory.decodeFile(File(path ?: value).absolutePath) ?: error("画像をデコードできませんでした")
        }
    }

    private fun elapsed(started: Long) = (System.nanoTime() - started) / 1_000_000.0

    override fun handleOnDestroy() {
        executor.shutdownNow()
        super.handleOnDestroy()
    }
}
