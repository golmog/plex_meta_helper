import SwiftUI
import AppKit

@main
struct PlexMetaHelperApp: App {
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 15) {
                Text("Plex Meta Helper Handler")
                    .font(.headline)
                Text("요청을 처리하는 중입니다...")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .frame(width: 300, height: 120)
            .onOpenURL { url in
                URLHandler.handle(url: url)
            }
        }
    }
}

class URLHandler {
    static func handle(url: URL) {
        let rawString = url.absoluteString
        
        // 1. 로컬 폴더 열기 (plexfolder://) -> Finder에서 해당 파일 선택 상태로 띄움
        if rawString.lowercased().hasPrefix("plexfolder://") {
            let payload = String(rawString.dropFirst("plexfolder://".count))
            if let path = payload.removingPercentEncoding, !path.isEmpty {
                let fileURL = URL(fileURLWithPath: path)
                NSWorkspace.shared.activateFileViewerSelecting([fileURL])
            }
            terminateApp()
            return
        }
        
        // 2. 로컬 파일 재생 (plexplay://) -> Mac 기본 연결 프로그램으로 즉시 실행
        if rawString.lowercased().hasPrefix("plexplay://") {
            let payload = String(rawString.dropFirst("plexplay://".count))
            if let videoPath = payload.removingPercentEncoding, !videoPath.isEmpty {
                let fileURL = URL(fileURLWithPath: videoPath)
                NSWorkspace.shared.open(fileURL)
            }
            terminateApp()
            return
        }
        
        // 3. 네트워크 스트리밍 재생 (plexstream://) -> IINA 강제 지정
        if rawString.lowercased().hasPrefix("plexstream://") {
            let payload = String(rawString.dropFirst("plexstream://".count))
            
            if let decodedPayload = payload.removingPercentEncoding {
                let parts = decodedPayload.components(separatedBy: "|")
                let videoUrl = parts.count > 0 ? parts[0] : ""
                var filename = ""
                
                if parts.count >= 3 {
                    filename = parts[2]
                }
                
                if !videoUrl.isEmpty {
                    launchIINAStream(videoUrl: videoUrl, filename: filename)
                }
            }
            terminateApp()
            return
        }
    }
    
    static func launchIINAStream(videoUrl: String, filename: String) {
        var finalUrl = videoUrl
        
        if !filename.isEmpty, let encodedFilename = filename.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            let joiner = finalUrl.contains("?") ? "&" : "?"
            finalUrl += "\(joiner)iina_filename=\(encodedFilename)"
        }
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        
        process.arguments = [
            "-a", "IINA", 
            finalUrl, 
            "--args", 
            "--mpv-tls-verify=no", 
            "--mpv-user-agent=Mozilla/5.0", 
            "--mpv-ytdl=no", 
            "--mpv-sub-auto=no", 
            "--mpv-audio-file-auto=no"
        ]
        
        do {
            try process.run()
            print("✅ 스트리밍 IINA 실행 성공")
        } catch {
            print("❌ IINA 실행 실패: \(error)")
        }
    }
    
    static func terminateApp() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            NSApp.terminate(nil)
        }
    }
}
