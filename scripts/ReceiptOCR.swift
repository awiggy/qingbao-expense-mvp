import Foundation
import Vision
import AppKit
import PDFKit

func recognize(_ image: CGImage) throws -> [[String: Any]] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    try VNImageRequestHandler(cgImage: image).perform([request])
    return (request.results ?? []).compactMap { observation in
        guard let text = observation.topCandidates(1).first else { return nil }
        return ["text": text.string, "confidence": text.confidence]
    }
}
do {
    guard CommandLine.arguments.count > 1 else { throw NSError(domain: "Missing input", code: 1) }
    let url = URL(fileURLWithPath: CommandLine.arguments[1])
    var lines: [[String: Any]] = []
    if url.pathExtension.lowercased() == "pdf" {
        guard let doc = PDFDocument(url: url), doc.pageCount <= 10 else { throw NSError(domain: "PDF must have 1 to 10 pages", code: 2) }
        for i in 0..<doc.pageCount {
            guard let page = doc.page(at: i) else { continue }
            let image = page.thumbnail(of: NSSize(width: 1600, height: 2200), for: .mediaBox)
            if CommandLine.arguments.count > 2 && i == 0 {
                if let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
                    try png.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
                }
            }
            if let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) { lines += try recognize(cg) }
        }
    } else {
        guard let ns = NSImage(contentsOf: url), let cg = ns.cgImage(forProposedRect: nil, context: nil, hints: nil) else { throw NSError(domain: "Unsupported image", code: 3) }
        lines = try recognize(cg)
    }
    let data = try JSONSerialization.data(withJSONObject: ["text": lines.map { $0["text"] as? String ?? "" }.joined(separator: "\n"), "lines": lines])
    print(String(data: data, encoding: .utf8)!)
} catch { fputs("Receipt OCR failed: \(error)\n", stderr); exit(1) }
