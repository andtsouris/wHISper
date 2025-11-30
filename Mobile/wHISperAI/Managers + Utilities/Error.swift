//
//  Error.swift
//  AnamnesisAssistant
//
//  Created by Felix Heilmeyer on 29.07.25.
//
import Foundation

enum GenericError: Error, LocalizedError {
    case message(String)

    public var errorDescription: String? {
        switch self {
        case .message(let message):
            return NSLocalizedString(message, comment: "Error")
        }
    }
}
