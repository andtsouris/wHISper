//
//  CreatewithSwift_AdvancedTranscriptionApp.swift
//  CreatewithSwift_AdvancedTranscription
//
//  Created by Matteo Altobello on 05/08/25.
//

import SwiftUI

@main
struct CreatewithSwift_AdvancedTranscriptionApp: App {
    @State private var viewModel = SpeechToTextViewModel()

    var body: some Scene {
        WindowGroup {
            NavigationView {
                VStack {
                    NavigationLink ("Assistant") {
                        ContentView()
                    }.padding()
                    NavigationLink ("Audio Test") {
                        AudioTestView()
                    }.padding()
                }
            }
        }.environment(viewModel)
    }
}
