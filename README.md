# w**HIS**per
Submission for the Black Forest SmartXHealth Hackathon

## Challenge 1: *VoiceMed*: The Voice-Controlled Clinical Assistant


### 🔍 Problem Statement:
In hospitals, interacting with Hospital Information Systems (HIS) is often complex, time-consuming, and requires manual data entry via keyboard and mouse. This issue leads to significant administrative overhead for medical staff, which consumes valuable time that is lost from direct patient care.

### 🎯 The Challenge:
How might we use Artificial Intelligence, particularly language models (LLMs) and speech recognition, to radically simplify interaction with the HIS?

## 💡 Our solution
We developed a **hands-free, voice-controlled clinical assistant** that enables a rapid, seamless and natural interaction between medical staff and the Hospital Information System (HIS) with **two levels of security** (physical and digital security). 

**Physical security** is ensured by an **NFC interaction** between the background service of the application and the NFC chip in the user’s hospital badge (such as the existing Uniklinikum Freiburg badges). The user has to simply place their phone in close proximity to their badge (i.e. putting them in the front pocket of their doctor’s coat). *There is no need to unlock the phone or press anything.*

Once the NFC interaction takes place ***passive listening*** mode is activated. In this mode, the phone waits for the user to say the phrase “***Hey wHISper!***” which activates a transition to active listening. **While passive listening all data remains on the phone**, forming a digital security barrier and ensuring data safety and privacy. The local passive listening AI model can later be set up so that it only responds to the user’s own voice.

In the ***Active listening*** mode, the application connects to the LLM and MCP server and enables the active voice-assistant feature. The user can interact with wHISper by **voice commands** for a hands-free experience. The doctor can switch to **text chat** whenever they want for extra privacy.
The voice-assistant is connected to the MCP server which has direct access to the HIS FHIR database.

## 🔧 Technical description 
The **wHISper voice-assistant system** is composed of 3 main parts, a Swift iOS application, a React/JavaScript web application and an MCP server.
### Swift iOS application:
The Swift iOS application can be installed on all hospital-issued iPhones and iPads (such as the ones already issued by the Uniklinikum Freiburg).

It detects the NFC tag of the user’s hospital badge and activates microphone access and Passive listening only when in proximity to the badge. It then runs a small AI model on the phone’s hardware that can identify the phrase “*Hey wHISper!*” to enable *Active listening*.

### React/Javascript web application:
The React/Javascript layer of our codebase is responsible for the **User Interface** (UI) and the **connection to the LLM**.

React allows us to link our voice-assistant link to natively implemented code (**iOS or Android apps**) but also to access it through any web browser, allowing for **desktop device support**.

The connection to the LLM is established via the [*Realtime-to-MCP API*](https://github.com/Gillinghammer/realtime-to-mcp) which connects our application and MCP to the latest **GPT-4o-Realtime** model by OpenAI. A **voice native** model that doesn’t rely on transcription of the audio stream to text but passes the audio stream directly to the model enabling a **faster** *(answers in less than 1 second)* **and more interactive experience**.

### FHIR MCP server:
The FHIR-specification is complex, very wordy and uses lots of ontologies that won’t fit into the model context. That’s why we took a different approach to implementing the MCP server. 
Instead of exposing the FHIR API we implemented tools that are intuitive and have a **direct clinical relevance to the user and the model**, like ‘*create_order*’, ‘*create_note*’. The MCP server then translates these requests into FHIR compliant resources like ServiceRequests and Observations.
This way, we can create FHIR and profile compliant resources, while improving accuracy and performance of the model.

