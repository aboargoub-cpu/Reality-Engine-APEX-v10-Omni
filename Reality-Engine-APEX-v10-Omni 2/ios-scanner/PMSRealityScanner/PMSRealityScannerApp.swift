import SwiftUI
import ARKit
import RealityKit
import Vision

@main
struct PMSRealityScannerApp: App {
    var body: some Scene { WindowGroup { ScannerView() } }
}

struct ControlPointObservation: Codable {
    let id: String
    let scan: [Float]
    let role: String
    let confidence: Float
    let timestamp: TimeInterval
}

struct ControlPointExport: Codable {
    let version: String
    let coordinateFrame: String
    let points: [ControlPointObservation]
}

struct ScannerView: View {
    @StateObject private var scanner = LiDARScanner()
    @State private var exportedPLY: URL?
    @State private var exportedJSON: URL?

    var body: some View {
        VStack(spacing: 14) {
            Text("PMS Reality Scanner").font(.title2).bold()
            Text("Automatic Control Point Mode").font(.headline)
            Text(scanner.status).font(.footnote).multilineTextAlignment(.center)
            Text("النقاط: \(scanner.pointCount)")
            Text("Control Points: \(scanner.controlPointCount)")
                .font(.subheadline).bold()
            if !scanner.detectedIDs.isEmpty {
                ScrollView(.horizontal) {
                    HStack {
                        ForEach(scanner.detectedIDs, id: \.self) { id in
                            Text("✓ \(id)").font(.caption).padding(6)
                                .background(.green.opacity(0.15)).clipShape(Capsule())
                        }
                    }
                }
            }
            HStack {
                Button(scanner.running ? "Stop Scan" : "Start Scan") {
                    if scanner.running { scanner.stop() } else { scanner.start() }
                }.buttonStyle(.borderedProminent)
                    .disabled(!ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth))
                if let url = exportedPLY { ShareLink(item: url) { Label("PLY", systemImage: "square.and.arrow.up") } }
                if let url = exportedJSON { ShareLink(item: url) { Label("Control JSON", systemImage: "doc.text") } }
            }
            Text("ضع علامات RCP-001, RCP-002… في الموقع. يجب أن تكون QR/Barcode واضحة للكاميرا. التطبيق يسجل مركز العلامة ثلاثياً مع وضع الهاتف، ثم يصدر PLY + control_points.json.")
                .font(.caption2).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if !ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
                Text("هذا الجهاز لا يدعم LiDAR Scene Depth. استخدم iPhone/iPad مزوداً بـ LiDAR.")
                    .foregroundStyle(.red)
            }
            Spacer()
        }
        .padding()
        .onReceive(scanner.$lastExportPLY) { exportedPLY = $0 }
        .onReceive(scanner.$lastExportJSON) { exportedJSON = $0 }
    }
}

final class LiDARScanner: NSObject, ObservableObject, ARSessionDelegate {
    @Published var running = false
    @Published var status = "جاهز — استخدم جهازاً مزوداً بـ LiDAR"
    @Published var pointCount = 0
    @Published var controlPointCount = 0
    @Published var detectedIDs: [String] = []
    @Published var lastExportPLY: URL?
    @Published var lastExportJSON: URL?

    private let session = ARSession()
    private var points: [SIMD3<Float>] = []
    private var controlPoints: [String: ControlPointObservation] = [:]
    private var frameCounter = 0
    private var lastVisionFrame = 0

    override init() {
        super.init()
        session.delegate = self
    }

    func start() {
        guard ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) else { return }
        points.removeAll(keepingCapacity: true)
        controlPoints.removeAll()
        frameCounter = 0
        lastVisionFrame = 0
        DispatchQueue.main.async {
            self.pointCount = 0
            self.controlPointCount = 0
            self.detectedIDs = []
        }
        let config = ARWorldTrackingConfiguration()
        config.frameSemantics.insert(.sceneDepth)
        config.environmentTexturing = .automatic
        session.run(config, options: [.resetTracking, .removeExistingAnchors])
        running = true
        status = "امشِ ببطء. ابحث عن علامات RCP-001… أثناء المسح."
    }

    func stop() {
        session.pause()
        running = false
        status = "اكتمل الالتقاط — تم حفظ PLY و control_points.json"
        if let urls = try? exportBundle() { lastExportPLY = urls.ply; lastExportJSON = urls.json }
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard running, let depth = frame.sceneDepth?.depthMap else { return }
        frameCounter += 1
        if frameCounter % 3 == 0 { sampleDepth(frame: frame, depth: depth) }
        if frameCounter - lastVisionFrame >= 6 {
            lastVisionFrame = frameCounter
            detectControlPoints(frame: frame, depth: depth)
        }
    }

    private func sampleDepth(frame: ARFrame, depth: CVPixelBuffer) {
        let width = CVPixelBufferGetWidth(depth), height = CVPixelBufferGetHeight(depth)
        CVPixelBufferLockBaseAddress(depth, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depth, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(depth) else { return }
        let rowBytes = CVPixelBufferGetBytesPerRow(depth)
        let ptr = base.assumingMemoryBound(to: Float32.self)
        let intr = frame.camera.intrinsics
        let imageSize = frame.camera.imageResolution
        let sx = Float(width) / Float(imageSize.width), sy = Float(height) / Float(imageSize.height)
        let fx = intr.columns.0.x * sx, fy = intr.columns.1.y * sy
        let cx = intr.columns.2.x * sx, cy = intr.columns.2.y * sy
        let transform = frame.camera.transform
        let step = 8
        var local: [SIMD3<Float>] = []
        for v in stride(from: 0, to: height, by: step) {
            let row = ptr.advanced(by: (rowBytes / MemoryLayout<Float32>.stride) * v)
            for u in stride(from: 0, to: width, by: step) {
                let z = row[u]
                guard z.isFinite, z > 0.15, z < 8.0 else { continue }
                let x = (Float(u) - cx) * z / fx
                let y = (Float(v) - cy) * z / fy
                let world = transform * SIMD4<Float>(x, y, -z, 1)
                local.append(SIMD3<Float>(world.x, world.y, world.z))
            }
        }
        DispatchQueue.main.async {
            self.points.append(contentsOf: local)
            self.pointCount = self.points.count
        }
    }

    private func detectControlPoints(frame: ARFrame, depth: CVPixelBuffer) {
        let request = VNDetectBarcodesRequest { [weak self] request, _ in
            guard let self = self else { return }
            guard let results = request.results as? [VNBarcodeObservation] else { return }
            for item in results {
                guard let payload = item.payloadStringValue else { continue }
                let id = payload.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
                guard id.hasPrefix("RCP-") else { continue }
                let center = CGPoint(x: item.boundingBox.midX, y: item.boundingBox.midY)
                if let xyz = self.worldPoint(fromNormalizedImagePoint: center, frame: frame, depth: depth) {
                    let obs = ControlPointObservation(id: id, scan: [xyz.x, xyz.y, xyz.z], role: "detected", confidence: item.confidence, timestamp: frame.timestamp)
                    DispatchQueue.main.async {
                        // Keep the best/latest observation per marker. Repeated views can be fused later in the backend.
                        self.controlPoints[id] = obs
                        self.controlPointCount = self.controlPoints.count
                        self.detectedIDs = self.controlPoints.keys.sorted()
                        self.status = "تم التعرف على \(id) — استمر في تغطية الموقع"
                    }
                }
            }
        }
        request.symbologies = [.QR, .Aztec, .DataMatrix, .Code128]
        let handler = VNImageRequestHandler(cvPixelBuffer: frame.capturedImage, orientation: .right, options: [:])
        DispatchQueue.global(qos: .userInitiated).async { try? handler.perform([request]) }
    }

    private func worldPoint(fromNormalizedImagePoint p: CGPoint, frame: ARFrame, depth: CVPixelBuffer) -> SIMD3<Float>? {
        let dw = CVPixelBufferGetWidth(depth), dh = CVPixelBufferGetHeight(depth)
        // Vision uses a normalized lower-left origin. Depth is sampled at the marker center.
        let u = min(max(Int(p.x * CGFloat(dw)), 0), dw - 1)
        let v = min(max(Int((1.0 - p.y) * CGFloat(dh)), 0), dh - 1)
        CVPixelBufferLockBaseAddress(depth, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depth, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(depth) else { return nil }
        let rowBytes = CVPixelBufferGetBytesPerRow(depth)
        let ptr = base.assumingMemoryBound(to: Float32.self)
        let centerIndex = (rowBytes / MemoryLayout<Float32>.stride) * v + u
        var z = ptr[centerIndex]
        if !z.isFinite || z <= 0.1 || z > 10 { return nil }
        // Median-ish search around center improves stability on marker edges/holes.
        var values: [Float] = []
        for dy in -2...2 { for dx in -2...2 {
            let xx=min(max(u+dx,0),dw-1), yy=min(max(v+dy,0),dh-1)
            let zz=ptr[(rowBytes / MemoryLayout<Float32>.stride)*yy+xx]
            if zz.isFinite && zz > 0.1 && zz < 10 { values.append(zz) }
        }}
        if !values.isEmpty { values.sort(); z=values[values.count/2] }
        let imageSize = frame.camera.imageResolution
        let intr = frame.camera.intrinsics
        let sx = Float(dw) / Float(imageSize.width), sy = Float(dh) / Float(imageSize.height)
        let fx = intr.columns.0.x * sx, fy = intr.columns.1.y * sy
        let cx = intr.columns.2.x * sx, cy = intr.columns.2.y * sy
        let x = (Float(u) - cx) * z / fx
        let y = (Float(v) - cy) * z / fy
        let world = frame.camera.transform * SIMD4<Float>(x, y, -z, 1)
        return SIMD3<Float>(world.x, world.y, world.z)
    }

    private func exportBundle() throws -> (ply: URL, json: URL) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("PMS_Scan_\(Int(Date().timeIntervalSince1970))")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let ply = dir.appendingPathComponent("scan.ply")
        var text = "ply\nformat ascii 1.0\nelement vertex \(points.count)\nproperty float x\nproperty float y\nproperty float z\nend_header\n"
        text.reserveCapacity(points.count * 32)
        for p in points { text += "\(p.x) \(p.y) \(p.z)\n" }
        try text.write(to: ply, atomically: true, encoding: .utf8)
        let cp = dir.appendingPathComponent("control_points.json")
        let payload = ControlPointExport(version: "1.0", coordinateFrame: "ARKit world frame", points: Array(controlPoints.values))
        let data = try JSONEncoder().encode(payload)
        try data.write(to: cp)
        // Share the folder as a file URL; Files can package it. A future production target can ZIP here.
        return (ply, cp)
    }
}
