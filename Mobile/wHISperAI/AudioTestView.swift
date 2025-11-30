//
//  AudioTestView.swift
//  wHISperAI
//
//  Created by Felix Heilmeyer on 29.11.25.
//

import SwiftUI

struct AudioTestView: View {
    @Environment(SpeechToTextViewModel.self) private var viewModel

    var body: some View {
        VStack {
            Button(action: {
                viewModel.voiceActivationEnabled = false
                viewModel.toggleRecording()
            }) {
                Image(
                    systemName: viewModel.model.isRecording
                        ? "stop.circle.fill" : "mic.circle.fill"
                ).font(.largeTitle)
            }
        }
    }
}
#Preview {
    @Previewable var viewModel = SpeechToTextViewModel()

    AudioTestView()
        .environment(viewModel)
}
