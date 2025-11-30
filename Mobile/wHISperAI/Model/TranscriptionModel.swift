//
//  TranscriptionModel.swift
//  TestTranscription
//
//  Created by Matteo Altobello on 03/08/25.
//


// MARK: - Model
import Foundation

struct TranscriptionModel {
    var finalizedText: String = ""
    var currentText: String = ""
    var isRecording: Bool = false
    
    var displayText: String {
        return finalizedText + currentText
    }
}
