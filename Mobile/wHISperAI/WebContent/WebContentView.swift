//
//  WebContentView.swift
//  AnamnesisAssistant
//
//  Created by Felix Heilmeyer on 07.04.25.
//

import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct WebContentView: View {
    var homeUrl: URL

    @State private var navigationError: Error? = nil
    @State private var loading: Bool = false
    @State private var targetUrl: URL? = nil
    @State private var pageTitle: String? = nil
    @State private var confirmationDialog: ConfirmationDialog?
    @State private var currentLocation: URL? = nil

    private var confirmationDialogPresented: Binding<Bool> {
        .init(
            get: { confirmationDialog != nil },
            set: { newValue in
                if !newValue {
                    confirmationDialog = nil
                }
            }
        )
    }

    var body: some View {
        Text(navigationError?.localizedDescription ?? "")

        WebView(
            targetUrl: $targetUrl,
            location: $currentLocation,
            navigationError: $navigationError,
            loading: $loading,
            pageTitle: $pageTitle,
            confirmationDialog: $confirmationDialog,
            storage: WKWebsiteDataStore.default()
        ).onAppear {
            if currentLocation == nil {
                targetUrl = homeUrl
            }
        } /*.toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
            if loading {
                    ProgressView()
                }
                Spacer()
                Button("Neu laden", systemImage: "arrow.clockwise") {
                    targetUrl = nil
                    targetUrl = currentLocation
                }
                Spacer()
                Button("Startseite", systemImage: "house.fill") {
                    targetUrl = homeUrl
                }
            }

        }*/.alert("confirmTitle", isPresented: confirmationDialogPresented) {
            Button("confirmButton", role: .destructive) {
                confirmationDialog?.handler(true)
            }
            Button("cancelButton", role: .cancel) {
                confirmationDialog?.handler(false)
            }
        } message: {
            Text(confirmationDialog?.message ?? "")
        }
    }
}

private struct WebView: UIViewRepresentable {
    @Binding var targetUrl: URL?
    @Binding var location: URL?
    @Binding var navigationError: Error?
    @Binding var loading: Bool
    @Binding var pageTitle: String?
    @Binding var confirmationDialog: ConfirmationDialog?
    let storage: WKWebsiteDataStore

    func makeCoordinator() -> Coordinator {
        .init(self)
    }

    func makeUIView(context: Context) -> some UIView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = storage
        configuration.setURLSchemeHandler(
            context.coordinator,
            forURLScheme: "demo"
        )
        let webView = WKWebView(
            frame: CGRect.zero,
            configuration: configuration
        )
        #if DEBUG
            webView.isInspectable = true
        #endif
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        if let url = targetUrl {
            webView.load(URLRequest(url: url))
        }
        context.coordinator.webView = webView

        context.coordinator.notificationToken = NotificationCenter.default.addObserver(
            for: ExecuteJavascript.self,
        ) { message in
            print("Script:", message.script)
            webView.evaluateJavaScript(message.script) { _, error in
                guard let error = error else { return }
                print("Error in JS: \(error.localizedDescription)")
            }
        }

        return webView
    }

    func setLocation(to location: URL?) async {
        self.location = location
    }

    func updateUIView(_ uiView: UIViewType, context: Context) {
        context.coordinator.load(targetUrl)
    }

    class Coordinator: NSObject, WKNavigationDelegate {
        var parent: WebView
        var notificationToken: NotificationCenter.ObservationToken?

        @objc private var observedWebView: WKWebView? = nil
        private var webViewTitleObservation: NSKeyValueObservation? = nil
        private var webViewUrlObservation: NSKeyValueObservation? = nil

        var webView: WKWebView? {
            didSet {
                guard let view = webView else { return }
                observedWebView = view
                webViewTitleObservation?.invalidate()
                webViewTitleObservation = observe(
                    \.observedWebView!.title,
                    options: [.new]
                ) { [weak self] _, change in
                    guard let self = self else { return }
                    self.parent.pageTitle = change.newValue ?? nil
                }

                webViewUrlObservation?.invalidate()
                webViewUrlObservation = observe(
                    \.observedWebView!.url,
                    options: [.new]
                ) { [weak self] _, change in
                    guard let self = self else { return }
                    Task {
                        await self.parent.setLocation(
                            to: change.newValue ?? nil
                        )
                    }
                }
            }
        }

        init(_ parent: WebView) {
            self.parent = parent
        }

        var lastLoadUrl: URL? = nil

        func load(_ url: URL?) {
            if url != lastLoadUrl {
                lastLoadUrl = url
                if let newUrl = url {
                    webView?.load(URLRequest(url: newUrl))
                }
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!)
        {
            self.parent.loading = false
            self.parent.targetUrl = nil
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: any Error
        ) {
            self.parent.navigationError = error
            self.parent.loading = false
        }

        func webView(
            _ webView: WKWebView,
            didStartProvisionalNavigation navigation: WKNavigation!
        ) {
            self.parent.loading = true
        }
    }
}

extension WebView.Coordinator: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor (Bool) -> Void
    ) {
        self.parent.confirmationDialog = .init(
            message: message,
            handler: completionHandler
        )
    }
}

private struct ConfirmationDialog {
    let message: String
    let handler: @MainActor (Bool) -> Void
}

extension WebView.Coordinator: WKURLSchemeHandler {
    fileprivate static func getAssetData(for url: URL) -> Data? {
        guard let assetName = url.deletingPathExtension().pathComponents.last
        else { return nil }
        let pathExtension =
            url.pathExtension.isEmpty ? "html" : url.pathExtension
        guard
            let bundleUrl = Bundle.main.url(
                forResource: assetName,
                withExtension: pathExtension,
                subdirectory: "DemoContent"
            )
        else { return nil }
        return try? Data(contentsOf: bundleUrl)
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask)
    {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(GenericError.message("no url"))
            return
        }

        guard let data = Self.getAssetData(for: url) else {
            let response = HTTPURLResponse(
                url: url,
                statusCode: 404,
                httpVersion: nil,
                headerFields: nil
            )!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive("not found".data(using: .utf8)!)
            urlSchemeTask.didFinish()
            return
        }

        let type =
            UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
            ?? "text/html"
        let response = HTTPURLResponse(
            url: url,
            mimeType: type,
            expectedContentLength: data.count,
            textEncodingName: nil
        )
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask)
    {}
}

class WebViewMessageBus {}

struct ExecuteJavascript: NotificationCenter.MainActorMessage {
    typealias Subject = WebViewMessageBus

    public static var name: Notification.Name {
        .init("WebContentView.ExecuteJavascript")
    }
    public let script: String
}

extension NotificationCenter.MessageIdentifier
where Self == NotificationCenter.BaseMessageIdentifier<ExecuteJavascript> {
    static var executeJavascript: Self { .init() }
}

#if DEBUG
    #Preview {
        NavigationStack {
            WebContentView(
                homeUrl: URL(string: "https://www.chatgpt.com")!
            )
        }
    }
#endif
