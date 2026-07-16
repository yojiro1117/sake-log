import Foundation
import Vision

enum NativeVisionModels {
    static func rect(_ rect: CGRect) -> [String: Double] {
        ["x": rect.origin.x, "y": rect.origin.y, "width": rect.width, "height": rect.height]
    }

    static func points(_ points: [CGPoint]) -> [[String: Double]] {
        points.map { ["x": $0.x, "y": $0.y] }
    }

    static func fileURL(_ value: String) -> URL? {
        if let url = URL(string: value), url.isFileURL { return url }
        return URL(fileURLWithPath: value.removingPercentEncoding ?? value)
    }

    static func regionName(_ index: Int) -> String {
        index == 0 ? "frontLabel" : "backLabel"
    }
}
