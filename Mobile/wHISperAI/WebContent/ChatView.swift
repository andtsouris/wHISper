//
//  ChatView.swift
//  wHISperAI
//
//  Created by Felix Heilmeyer on 28.11.25.
//

import SwiftUI

struct ChatView: View {
    var body: some View {
        WebContentView(
            homeUrl: URL(string: "http://localhost:8084")!, // Replace with your server URL
        )
    }
}

#Preview {
    ChatView()
}
