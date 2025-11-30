//
//  SpeechToTextViewModel.swift
//  TestTranscription
//
//  Created by Matteo Altobello on 03/08/25.
//


import Foundation
import Speech
import AVFoundation

@MainActor
@Observable
class SpeechToTextViewModel {
    private(set) var model = TranscriptionModel()
    private(set) var errorMessage: String?
    var speechActivated = false
    
    private var internalTranscriptionState = TranscriptionModel()
    
    var voiceActivationEnabled = true

    let audioManager = AudioManager()
    private let transcriptionManager = TranscriptionManager()
    
    private let whitespaceRegex = try! Regex("\\s+")
    
    func toggleRecording() {
        if model.isRecording {
            Task { await stopRecording() }
        } else {
            Task { await startRecording() }
        }
    }
    
    func clearTranscript() {
        model.finalizedText = ""
        model.currentText = ""
        errorMessage = nil
    }
    
    func clearInternalState() {
        internalTranscriptionState.finalizedText = ""
        internalTranscriptionState.currentText = ""
    }
    
    private func startRecording() async {
        guard await requestPermissions() else {
            errorMessage = "Permissions not granted"
            return
        }
        
        Task {
            do {
                try audioManager.setupAudioSession()
                
                try await transcriptionManager.startTranscription { [weak self] text, isFinal in
                    Task { @MainActor in
                        guard let self = self else { return }
                        if isFinal {
                            self.model.finalizedText += text + " "
                            self.model.currentText = ""
                        } else {
                            self.model.currentText = text
                        }
                    }
                    if self?.voiceActivationEnabled ?? true {
                        Task { @MainActor in
                            guard let self = self else { return }
                            if isFinal {
                                self.internalTranscriptionState.finalizedText += text + " "
                                self.internalTranscriptionState.currentText = ""
                            } else {
                                self.internalTranscriptionState.currentText = text
                            }
                            var text = (self.internalTranscriptionState.currentText + self.internalTranscriptionState.currentText)
                                .lowercased().replacingOccurrences(of: ",", with: " ").replacingOccurrences(of: ".", with: " ")
                            text.replace(self.whitespaceRegex, with: " ")
                            if text.contains("hey whisper") {
                                self.clearInternalState()
                                self.speechActivated = true
                                await self.playChime()
                            }
                        }
                    }
                }
                
                try audioManager.startAudioStream { [weak self] buffer in
                    try? self?.transcriptionManager.processAudioBuffer(buffer)
                }
                
                Task { @MainActor in
                    model.isRecording = true
                    errorMessage = nil
                }
            } catch {
                Task { @MainActor in
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
    
    func playChime() async {
        await audioManager.startPlaying(buffer: audioManager.chimeBuffer)
    }
    
    private func stopRecording() async {
        audioManager.stopAudioStream()
        await transcriptionManager.stopTranscription()
        model.isRecording = false
    }
    
    private func requestPermissions() async -> Bool {
        let speechPermission = await transcriptionManager.requestSpeechPermission()
        let micPermission = await audioManager.requestMicrophonePermission()
        return speechPermission && micPermission
    }
}
