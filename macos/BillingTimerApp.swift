import Cocoa
import WebKit

let serverURL = URL(string: "http://localhost:3001")!

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var serverProcess: Process?
    private var managesServer = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        let webView = WKWebView(frame: .zero)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1120, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Billing Timer"
        window.center()
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        self.window = window
        NSApp.activate(ignoringOtherApps: true)

        // Start the backend (unless something is already serving the port),
        // wait until it answers, then load the UI.
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            if !self.serverResponds() {
                self.startServer()
                _ = self.waitForServer(timeout: 20)
            }
            DispatchQueue.main.async {
                webView.load(URLRequest(url: serverURL))
            }
        }
    }

    private func resourcePath() -> String {
        Bundle.main.resourcePath ?? FileManager.default.currentDirectoryPath
    }

    private func dataDir() -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return home
            .appendingPathComponent("Library/Application Support/Billing Timer")
            .path
    }

    private func nodePath() -> String? {
        let file = resourcePath() + "/node-path"
        guard let raw = try? String(contentsOfFile: file, encoding: .utf8) else {
            return nil
        }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func startServer() {
        guard let node = nodePath() else {
            NSLog("Billing Timer: node path not found in bundle; not starting server.")
            return
        }

        let appDir = resourcePath() + "/app"
        let dataDirectory = dataDir()
        try? FileManager.default.createDirectory(
            atPath: dataDirectory, withIntermediateDirectories: true
        )

        let process = Process()
        process.executableURL = URL(fileURLWithPath: node)
        process.arguments = [appDir + "/server/index.mjs"]
        process.currentDirectoryURL = URL(fileURLWithPath: appDir)

        var env = ProcessInfo.processInfo.environment
        env["PORT"] = "3001"
        env["BILLING_TIMER_DATA_DIR"] = dataDirectory
        process.environment = env

        do {
            try process.run()
            self.serverProcess = process
            self.managesServer = true
        } catch {
            NSLog("Billing Timer: failed to start server: \(error)")
        }
    }

    private func serverResponds() -> Bool {
        var ok = false
        let semaphore = DispatchSemaphore(value: 0)
        var request = URLRequest(url: serverURL)
        request.timeoutInterval = 1.0
        let task = URLSession.shared.dataTask(with: request) { _, response, _ in
            if let http = response as? HTTPURLResponse, http.statusCode >= 200 {
                ok = true
            }
            semaphore.signal()
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + 1.5)
        return ok
    }

    private func waitForServer(timeout seconds: Double) -> Bool {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            if serverResponds() { return true }
            Thread.sleep(forTimeInterval: 0.25)
        }
        return false
    }

    func applicationWillTerminate(_ notification: Notification) {
        guard managesServer, let process = serverProcess, process.isRunning else { return }
        process.terminate()
        // Give it a moment to shut down cleanly, then force-kill if needed.
        let deadline = Date().addingTimeInterval(3)
        while process.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.1)
        }
        if process.isRunning {
            kill(process.processIdentifier, SIGKILL)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()

app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
