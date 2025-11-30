import { useState, useEffect, useRef } from 'react'
import voiceActivateIcon from '../assets/voice_activate_icon.svg'

function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [status, setStatus] = useState('Disconnected');
  const [transcript, setTranscript] = useState([]);
  const [textInput, setTextInput] = useState('');
  
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const audioElRef = useRef(null);
  const pendingMessageRef = useRef(null);

  // // Splash screen timer
  // useEffect(() => {
  //   const timer = setTimeout(() => {
  //     setShowSplashScreen(false);
  //   }, 3000);
  //   return () => clearTimeout(timer);
  // }, []);

  // Initialize audio element
  useEffect(() => {
    audioElRef.current = document.createElement('audio');
    audioElRef.current.autoplay = true;
  }, []);

  // EPHEMERAL_KEY FUNCTION FOR FELIX!
  const getEphemeralKey = async () => {
    // 1. Get ephemeral token from our bridge server
    const tokenResponse = await fetch('http://localhost:8084/session'); // Replace with your bridge server URL
    if (!tokenResponse.ok) throw new Error('Failed to get session token');
    const data = await tokenResponse.json();
    return data.client_secret.value;
  };

  const startSession = async () => {
    try {
      setStatus('Requesting session...');
      
      const EPHEMERAL_KEY = await getEphemeralKey();

      setStatus('Connecting to OpenAI...');

      // 2. Create PeerConnection
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // Handle remote audio
      pc.ontrack = (e) => {
        if (audioElRef.current) {
          audioElRef.current.srcObject = e.streams[0];
        }
      };

      // 3. Add local microphone
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      pc.addTrack(ms.getTracks()[0]);

      // 4. Set up Data Channel for events
      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.onopen = () => {
        setStatus('Connected! Start talking.');
        setIsSessionActive(true);
        
        // Enable input audio transcription
        dc.send(JSON.stringify({ 
          type: 'session.update', 
          session: {
            input_audio_transcription: {
              model: 'whisper-1'
            }
          }
        }));

        if (pendingMessageRef.current) {
          const message = pendingMessageRef.current;
          pendingMessageRef.current = null;
          
          const newItem = {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: message
              }
            ]
          };
          
          dc.send(JSON.stringify({
            type: 'conversation.item.create',
            item: newItem
          }));
          dc.send(JSON.stringify({ type: 'response.create' }));
          
          setTranscript(prev => [...prev, { 
            role: 'user', 
            content: message 
          }]);
          setTextInput('');
        }
      };

      dc.onmessage = async (e) => {
        const event = JSON.parse(e.data);
        console.log('Received event:', event);
        
        // Handle function calls (MCP tools)
        if (event.type === 'response.function_call_arguments.done') {
          const { name, arguments: args, call_id } = event;
          
          // Add to transcript
          setTranscript(prev => [...prev, { 
            role: 'assistant', 
            content: `Calling tool: ${name}....` 
          }]);

          try {
            const body = JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                  name: name,
                  arguments: JSON.parse(args)
                },
                id: Date.now()
              });
            
            console.log('MCP Call body:', body);

            // Proxy to our bridge server
            const mcpResponse = await fetch('http://localhost:8084/mcp', { // Replace with your bridge server URL
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: body,
            });

            const result = await mcpResponse.json();
            console.log('MCP Call result:', result);
            
            // Send result back to OpenAI
            const toolOutput = {
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: call_id,
                output: JSON.stringify(result.result)
              }
            };
            dc.send(JSON.stringify(toolOutput));
            
            // Trigger response generation
            dc.send(JSON.stringify({ type: 'response.create' }));

          } catch (err) {
            console.error('MCP Call failed:', err);
          }
        }
        
        // Handle transcription (optional, for UI)
        if (event.type === 'response.audio_transcript.done') {
           setTranscript(prev => [...prev, { 
             role: 'assistant', 
             content: event.transcript 
           }]);
        }
        if (event.type === 'conversation.item.input_audio_transcription.completed') {
           setTranscript(prev => [...prev, { 
             role: 'user', 
             content: event.transcript 
           }]);
        }
      };

      // 5. Start WebRTC Handshake
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = 'https://api.openai.com/v1/realtime';
      const model = 'gpt-4o-realtime-preview-2024-12-17';
      
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          'Content-Type': 'application/sdp'
        },
      });

      const answer = {
        type: 'answer',
        sdp: await sdpResponse.text(),
      };

      await pc.setRemoteDescription(answer);

    } catch (err) {
      console.error('Session start failed:', err);
      setStatus(`Error: ${err.message}`);
      setIsSessionActive(false);
    }
  };

  const stopSession = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    setIsSessionActive(false);
    setStatus('Disconnected');
  };

  // Expose functions to window for Swift bridge
  useEffect(() => {
    window.startVoiceSession = startSession;
    window.stopVoiceSession = stopSession;
    window.getEphemeralKey = getEphemeralKey;
    return () => {
      delete window.startVoiceSession;
      delete window.stopVoiceSession;
      delete window.getEphemeralKey;
    };
  });

  const handleSendMessage = () => {
    if (!textInput.trim()) return;
    
    if (!isSessionActive) {
      pendingMessageRef.current = textInput;
      startSession();
      return;
    }

    const newItem = {
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: textInput
        }
      ]
    };

    const dc = dataChannelRef.current;
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify({
        type: 'conversation.item.create',
        item: newItem
      }));
      dc.send(JSON.stringify({ type: 'response.create' }));
      
      setTranscript(prev => [...prev, { 
        role: 'user', 
        content: textInput 
      }]);
      
      setTextInput('');
    }
  };

  return (
    <div className="chat-container">
      <div className="top-bar">
          <div className="user-info">
            <span className="user-name">Marty Cole</span>
            <div className="user-tags">
              <span className="tag">P12345</span>
              <span className="tag">67y</span>
              <span className="tag">M</span>
            </div>
          </div>
        </div>
        <div className="messages">
        {transcript.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {transcript.length === 0 && (
          <div className="message assistant">
            Hey
          </div>
        )}
      </div>
      
      <div style={{ width: '100%', fontSize: '0.8rem', color: '#666', textAlign: 'center', padding: '0.5rem' }}>
        {status}
      </div>
      
      <div className="input-area">
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendMessage();
          }}
          enterKeyHint="send"
          placeholder="Type a message..."
        />
        <button 
          onClick={isSessionActive ? stopSession : startSession}
          className={isSessionActive ? "active" : ""}
          style={{ 
            backgroundColor: isSessionActive ? '#fff' : '#fff', 
            borderRadius: '50%', 
            width: '3rem', 
            height: '3rem', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: 0
          }}
        >
          {isSessionActive ? "⏹️" : <img src={voiceActivateIcon} alt="Start Voice" style={{ width: '50%', height: '50%' }} />}
        </button>
      </div>
    </div>
  )
}

export default App
