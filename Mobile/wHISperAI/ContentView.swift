//
//  ContentView.swift
//  CreatewithSwift_AdvancedTranscription
//
//  Created by Matteo Altobello on 05/08/25.
//

import SwiftUI

struct ContentView: View {
    @State private var voiceActivated = false
    @State private var showTranscription = false
    
    @Environment(SpeechToTextViewModel.self) private var viewModel
    
    private func activateVoice() {
        NotificationCenter.default.post(
            ExecuteJavascript(script: "window.startVoiceSession()")
        )
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                ChatView()
                
                if showTranscription {
                    Spacer()
                    ScrollView {
                        VStack(alignment: .leading, spacing: 10) {
                            if !viewModel.model.displayText.isEmpty {
                                Text(viewModel.model.displayText)
                                    .font(.body)
                                    .padding()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color.gray.opacity(0.1))
                                    .cornerRadius(10)
                            } else {
                                Text("Tap the microphone to start recording...")
                                    .font(.body)
                                    .foregroundColor(.secondary)
                                    .padding()
                            }
                            if let errorMessage = viewModel.errorMessage {
                                Text(errorMessage)
                                    .font(.caption)
                                    .foregroundColor(.red)
                                    .padding(.horizontal)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: 200)
                }
                
            }
            .edgesIgnoringSafeArea([.top])
            .background(voiceActivated ? Color.red : Color.black)
            .onChange(of: viewModel.speechActivated) { newValue in
                activateVoice()
                withAnimation {
                    voiceActivated = newValue
                }
                if newValue {
                    Task {
                        try? await Task.sleep(for: .seconds(0.5))
                        Task { @MainActor in
                            voiceActivated = false
                            viewModel.speechActivated = false
                        }
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        viewModel.clearTranscript()
                    }) {
                        Image(systemName: "trash")
                    }
                    .disabled(viewModel.model.displayText.isEmpty)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        showTranscription.toggle()
                    }) {
                        Image(
                            systemName: showTranscription
                                ? "pencil.slash" : "pencil"
                        )
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        viewModel.voiceActivationEnabled = true
                        viewModel.toggleRecording()
                    }) {
                        Image(
                            systemName: viewModel.model.isRecording
                                ? "stop.circle.fill" : "mic.circle.fill"
                        )
                    }
                }
            }
        }
    }
}

#Preview {
    @Previewable var viewModel = SpeechToTextViewModel()
    
    ContentView()
        .environment(viewModel)
}
