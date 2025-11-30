//
//  AudioManager.swift
//  TestTranscription
//
//  Created by Matteo Altobello on 03/08/25.
//

import AVFoundation
import Foundation

private struct PlayerEngine {
    let engine: AVAudioEngine
    let player: AVAudioPlayerNode

    init() {
        engine = AVAudioEngine()
        player = AVAudioPlayerNode()
        engine.attach(player)
    }
}

class AudioManager {
    private var audioTapInstalled = false

    private var playerEngine = PlayerEngine()
    private var recordedFilePlayer: AVAudioPlayerNode {
        return playerEngine.player
    }
    private var audioEngine: AVAudioEngine {
        return playerEngine.engine
    }
    
    private var volumeObservation: NSKeyValueObservation?
    
    // static let demo1Url = Bundle.main.url(forResource: "demo1", withExtension: "m4a")!
    // private(set) lazy var demo1Buffer: AVAudioPCMBuffer = {
    //     return Self.getBuffer(fileURL: Self.demo1Url)!
    // }()
    // static let demo2Url = Bundle.main.url(forResource: "demo2", withExtension: "m4a")!
    // private(set) lazy var demo2Buffer: AVAudioPCMBuffer = {
    //     return Self.getBuffer(fileURL: Self.demo2Url)!
    // }()
    // static let demo3Url = Bundle.main.url(forResource: "demo3", withExtension: "m4a")!
    // private(set) lazy var demo3Buffer: AVAudioPCMBuffer = {
    //     return Self.getBuffer(fileURL: Self.demo3Url)!
    // }()

    // private var demoCounter = 0
    
    func setupAudioSession() throws {
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.duckOthers, .defaultToSpeaker]
        )
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        // volumeObservation = audioSession.observe(\.outputVolume, options: [.old, .new]) { _, change in
        //     if (change.newValue ?? 0) > (change.oldValue ?? 0) {
        //         let item = self.demoCounter % 4
        //         self.demoCounter += 1
        //         Task {
        //             switch item {
        //             case 0:
        //                 await self.startPlaying(buffer: self.chimeBuffer)
        //             case 1:
        //                 await self.startPlaying(buffer: self.demo1Buffer)
        //             case 2:
        //                 await self.startPlaying(buffer: self.demo3Buffer)
        //             case 3:
        //                 await self.startPlaying(buffer: self.chimeBuffer)
        //                 await self.startPlaying(buffer: self.demo2Buffer)
        //             default:
        //                 print("this should never happen")
        //             }
        //         }
        //     } else if (change.newValue ?? 0) < (change.oldValue ?? 0) {
        //         self.recordedFilePlayer.stop()
        //         self.demoCounter = 0
        //     }
        // }
    }

    func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }
    
    static let chimeUrl = Bundle.main.url(forResource: "activation", withExtension: "m4a")!
    private(set) lazy var chimeBuffer: AVAudioPCMBuffer = {
        return Self.getBuffer(fileURL: Self.chimeUrl)!
    }()

    func startAudioStream(onBuffer: @escaping (AVAudioPCMBuffer) -> Void) throws
    {
        guard !audioTapInstalled else { return }
        
        let input = audioEngine.inputNode
        do {
            try input.setVoiceProcessingEnabled(true)
        } catch {
            print("Could not enable voice processing \(error)")
        }
        
        let output = audioEngine.outputNode
        let mainMixer = audioEngine.mainMixerNode

        audioEngine.connect(
            recordedFilePlayer,
            to: mainMixer,
            format: self.chimeBuffer.format
        )
        audioEngine.connect(mainMixer, to: output, format: self.chimeBuffer.format)

        audioEngine.inputNode.installTap(
            onBus: 0,
            bufferSize: 4096,
            format: audioEngine.inputNode.outputFormat(forBus: 0)
        ) { buffer, _ in
            onBuffer(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()
        audioTapInstalled = true
    }
    
    func stopAudioStream() {
        guard audioTapInstalled else { return }

        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        audioTapInstalled = false
    }

    func startPlaying(buffer: AVAudioPCMBuffer) async {
        guard audioTapInstalled else {
            print("Can't play file when audio stream is not started")
            return
        }
        
        recordedFilePlayer.play()
        await recordedFilePlayer.scheduleBuffer(
            buffer,
            at: nil,
            options: []
        )
    }

    private static func getBuffer(fileURL: URL) -> AVAudioPCMBuffer? {
        let file: AVAudioFile!
        do {
            try file = AVAudioFile(forReading: fileURL)
        } catch {
            print("Could not load file: \(error)")
            return nil
        }
        file.framePosition = 0

        // Add 100 ms to the capacity.
        let bufferCapacity =
            AVAudioFrameCount(file.length)
            + AVAudioFrameCount(file.processingFormat.sampleRate * 0.1)
        
        guard
            let buffer = AVAudioPCMBuffer(
                pcmFormat: file.processingFormat,
                frameCapacity: bufferCapacity
            )
        else { return nil }
        do {
            try file.read(into: buffer)
        } catch {
            print("Could not load file into buffer: \(error)")
            return nil
        }
        file.framePosition = 0
        return buffer
    }
}
