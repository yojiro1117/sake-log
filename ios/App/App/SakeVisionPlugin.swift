import Foundation
import UIKit
import Vision
import CoreImage
import Capacitor

@objc(SakeVisionPlugin)
public class SakeVisionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SakeVisionPlugin"
    public let jsName = "SakeVision"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "analyzeImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "detectLabelRegions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recognizeText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readBarcodes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createImageEmbedding", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "compareImages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]

    private let queue = DispatchQueue(label: "jp.yojiro.sakelog.vision", qos: .userInitiated)
    private var cancelled = Set<String>()
    private let cancelLock = NSLock()

    @objc func getCapabilities(_ call: CAPPluginCall) {
        UIDevice.current.isBatteryMonitoringEnabled = true
        var capabilities: [String: Any] = [
            "environment": "ios-native",
            "platform": "iOS",
            "osVersion": UIDevice.current.systemVersion,
            "deviceModel": UIDevice.current.model,
            "ocrEngine": "apple-vision",
            "barcodeEngine": "VNDetectBarcodesRequest",
            "visualEngine": "VNGenerateImageFeaturePrintRequest",
            "modelVersion": "Apple Vision / iOS \(UIDevice.current.systemVersion)",
            "supportsLabelDetection": true,
            "supportsTextRecognition": true,
            "supportsBarcode": true,
            "supportsVisualEmbedding": true,
            "thermalState": thermalStateName(ProcessInfo.processInfo.thermalState)
        ]
        if UIDevice.current.batteryLevel >= 0 {
            capabilities["batteryLevel"] = Double(UIDevice.current.batteryLevel)
        }
        call.resolve(capabilities)
    }

    @objc func cancel(_ call: CAPPluginCall) {
        if let signalId = call.getString("signalId") {
            cancelLock.lock(); cancelled.insert(signalId); cancelLock.unlock()
        }
        call.resolve()
    }

    @objc func detectLabelRegions(_ call: CAPPluginCall) {
        withImage(call) { image, started in
            let regions = try self.detectRegions(image)
            return ["regions": regions, "processingTimeMs": self.elapsed(started)]
        }
    }

    @objc func recognizeText(_ call: CAPPluginCall) {
        withImage(call) { image, started in
            let signalId = call.getString("signalId")
            let regions = try self.detectRegionObservations(image)
            let observations = try self.recognize(image, regions: regions, signalId: signalId)
            return ["observations": observations, "processingTimeMs": self.elapsed(started), "engine": "apple-vision"]
        }
    }

    @objc func readBarcodes(_ call: CAPPluginCall) {
        withImage(call) { image, started in
            let request = VNDetectBarcodesRequest()
            request.symbologies = [.ean8, .ean13, .upce, .code128, .qr, .dataMatrix]
            try VNImageRequestHandler(ciImage: image, options: [:]).perform([request])
            let values = (request.results ?? []).compactMap { item -> [String: Any]? in
                guard let payload = item.payloadStringValue else { return nil }
                return ["rawValue": payload, "format": item.symbology.rawValue, "confidence": Double(item.confidence), "boundingBox": NativeVisionModels.rect(item.boundingBox)]
            }
            return ["observations": values, "processingTimeMs": self.elapsed(started)]
        }
    }

    @objc func createImageEmbedding(_ call: CAPPluginCall) {
        withImage(call) { image, started in
            _ = try self.featurePrint(image)
            let values = self.compactEmbedding(image)
            return ["values": values, "model": "VNFeaturePrint+sake-local-fingerprint-v1", "dimensions": values.count, "processingTimeMs": self.elapsed(started)]
        }
    }

    @objc func compareImages(_ call: CAPPluginCall) {
        guard let first = call.getString("firstFileUri"), let second = call.getString("secondFileUri"),
              let firstURL = NativeVisionModels.fileURL(first), let secondURL = NativeVisionModels.fileURL(second),
              let firstImage = CIImage(contentsOf: firstURL), let secondImage = CIImage(contentsOf: secondURL) else {
            call.reject("比較する画像ファイルを読み込めませんでした。")
            return
        }
        queue.async {
            do {
                let left = try self.featurePrint(firstImage)
                let right = try self.featurePrint(secondImage)
                var distance: Float = 0
                try left.computeDistance(&distance, to: right)
                let similarity = max(0, 1 - Double(distance) / 2)
                call.resolve(["distance": Double(distance), "similarity": similarity, "model": "VNGenerateImageFeaturePrintRequest"])
            } catch { call.reject("画像特徴を比較できませんでした。", nil, error) }
        }
    }

    @objc func analyzeImage(_ call: CAPPluginCall) {
        withImage(call) { image, started in
            let signalId = call.getString("signalId")
            let regionObservations = try self.detectRegionObservations(image)
            if self.isCancelled(signalId) { throw CancellationError() }
            let text = try self.recognize(image, regions: regionObservations, signalId: signalId)
            if self.isCancelled(signalId) { throw CancellationError() }
            let barcodeRequest = VNDetectBarcodesRequest()
            barcodeRequest.symbologies = [.ean8, .ean13, .upce, .code128, .qr, .dataMatrix]
            try VNImageRequestHandler(ciImage: image, options: [:]).perform([barcodeRequest])
            let barcodes = (barcodeRequest.results ?? []).compactMap { item -> [String: Any]? in
                guard let value = item.payloadStringValue else { return nil }
                return ["rawValue": value, "format": item.symbology.rawValue, "confidence": Double(item.confidence), "boundingBox": NativeVisionModels.rect(item.boundingBox)]
            }
            let regions = regionObservations.enumerated().map { self.regionJSON($0.element, index: $0.offset) }
            let embedding = self.compactEmbedding(image)
            return [
                "textObservations": text,
                "barcodeObservations": barcodes,
                "labelRegions": regions,
                "visualEmbedding": ["values": embedding, "model": "VNFeaturePrint+sake-local-fingerprint-v1", "dimensions": embedding.count],
                "imageQuality": self.quality(image, regions: regionObservations),
                "processingTimeMs": self.elapsed(started),
                "warnings": regions.isEmpty ? ["ラベル領域を検出できなかったため画像全体も解析しました。"] : []
            ]
        }
    }

    private func withImage(_ call: CAPPluginCall, operation: @escaping (CIImage, CFAbsoluteTime) throws -> [String: Any]) {
        guard let value = call.getString("localFileUri"), let url = NativeVisionModels.fileURL(value), let image = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else {
            call.reject("画像ファイルを読み込めませんでした。")
            return
        }
        queue.async {
            let started = CFAbsoluteTimeGetCurrent()
            do { call.resolve(try operation(image, started)) }
            catch is CancellationError { call.reject("画像解析をキャンセルしました。", "CANCELLED") }
            catch { call.reject("画像解析に失敗しました。", nil, error) }
        }
    }

    private func detectRegionObservations(_ image: CIImage) throws -> [VNRectangleObservation] {
        let request = VNDetectRectanglesRequest()
        request.maximumObservations = 4
        request.minimumConfidence = 0.45
        request.minimumAspectRatio = 0.2
        request.maximumAspectRatio = 1.0
        request.minimumSize = 0.12
        request.quadratureTolerance = 30
        try VNImageRequestHandler(ciImage: image, options: [:]).perform([request])
        return request.results ?? []
    }

    private func detectRegions(_ image: CIImage) throws -> [[String: Any]] {
        try detectRegionObservations(image).enumerated().map { regionJSON($0.element, index: $0.offset) }
    }

    private func regionJSON(_ item: VNRectangleObservation, index: Int) -> [String: Any] {
        [
            "id": "vision-region-\(index)", "boundingBox": NativeVisionModels.rect(item.boundingBox),
            "cornerPoints": NativeVisionModels.points([item.topLeft, item.topRight, item.bottomRight, item.bottomLeft]),
            "confidence": Double(item.confidence), "regionType": NativeVisionModels.regionName(index), "perspectiveCorrected": true
        ]
    }

    private func recognize(_ image: CIImage, regions: [VNRectangleObservation], signalId: String?) throws -> [[String: Any]] {
        var output: [[String: Any]] = []
        let cropPasses: [(CIImage, String)] = regions.prefix(3).enumerated().compactMap {
            guard let crop = perspectiveCrop(image, rectangle: $0.element) else { return nil }
            return (crop, "label-\($0.offset)")
        }
        let passes = cropPasses + [(image, "full")]
        for (index, pass) in passes.enumerated() {
            if isCancelled(signalId) { throw CancellationError() }
            for minimumHeight in [0.018, 0.008] {
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.recognitionLanguages = ["ja-JP", "en-US"]
                request.usesLanguageCorrection = true
                request.minimumTextHeight = Float(minimumHeight)
                request.regionOfInterest = CGRect(x: 0, y: 0, width: 1, height: 1)
                try VNImageRequestHandler(ciImage: pass.0, options: [:]).perform([request])
                for observation in request.results ?? [] {
                    guard let candidate = observation.topCandidates(3).first else { continue }
                    output.append([
                        "text": candidate.string, "confidence": Double(candidate.confidence),
                        "boundingBox": NativeVisionModels.rect(observation.boundingBox),
                        "regionType": index < cropPasses.count ? NativeVisionModels.regionName(index) : "fullImage",
                        "engine": "apple-vision", "passId": "\(pass.1)-h\(minimumHeight)"
                    ])
                }
            }
        }
        return output
    }

    private func featurePrint(_ image: CIImage) throws -> VNFeaturePrintObservation {
        let request = VNGenerateImageFeaturePrintRequest()
        try VNImageRequestHandler(ciImage: image, options: [:]).perform([request])
        guard let result = request.results?.first as? VNFeaturePrintObservation else { throw NSError(domain: "SakeVision", code: 2) }
        return result
    }

    private func perspectiveCrop(_ image: CIImage, rectangle: VNRectangleObservation) -> CIImage? {
        let extent = image.extent
        func point(_ value: CGPoint) -> CIVector {
            CIVector(x: extent.minX + value.x * extent.width, y: extent.minY + value.y * extent.height)
        }
        return image.applyingFilter("CIPerspectiveCorrection", parameters: [
            "inputTopLeft": point(rectangle.topLeft),
            "inputTopRight": point(rectangle.topRight),
            "inputBottomLeft": point(rectangle.bottomLeft),
            "inputBottomRight": point(rectangle.bottomRight)
        ])
    }

    private func compactEmbedding(_ image: CIImage) -> [Double] {
        let context = CIContext(options: [.workingColorSpace: NSNull()])
        let target = CGRect(x: 0, y: 0, width: 8, height: 8)
        let sourceWidth = max(CGFloat(1), image.extent.width)
        let sourceHeight = max(CGFloat(1), image.extent.height)
        let scale = CGAffineTransform(scaleX: CGFloat(8) / sourceWidth, y: CGFloat(8) / sourceHeight)
        let normalized = image.transformed(by: scale).cropped(to: target)
        var bytes = [UInt8](repeating: 0, count: 8 * 8 * 4)
        context.render(normalized, toBitmap: &bytes, rowBytes: 8 * 4, bounds: target, format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())

        var embedding: [Double] = []
        embedding.reserveCapacity(64)
        for index in stride(from: 0, to: bytes.count, by: 4) {
            let red = Double(bytes[index])
            let green = Double(bytes[index + 1])
            let blue = Double(bytes[index + 2])
            let luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255.0
            embedding.append(luminance)
        }
        return embedding
    }

    private func quality(_ image: CIImage, regions: [VNRectangleObservation]) -> [String: Any] {
        let coverage = regions.map { $0.boundingBox.width * $0.boundingBox.height }.max() ?? 0
        return ["blurScore": 0.5, "brightnessScore": 0.5, "glareScore": 0.0, "labelCoverage": coverage, "warnings": []]
    }

    private func elapsed(_ started: CFAbsoluteTime) -> Double { (CFAbsoluteTimeGetCurrent() - started) * 1000 }
    private func isCancelled(_ signalId: String?) -> Bool {
        guard let signalId else { return false }
        cancelLock.lock(); defer { cancelLock.unlock() }
        return cancelled.contains(signalId)
    }
    private func thermalStateName(_ state: ProcessInfo.ThermalState) -> String {
        switch state { case .nominal: return "nominal"; case .fair: return "fair"; case .serious: return "serious"; case .critical: return "critical"; @unknown default: return "unknown" }
    }
}
