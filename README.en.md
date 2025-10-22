# Open Modular Input Protocol (OMIP)

[日本語](README.md) | English

## Overview

The Open Modular Input Protocol (OMIP) is an open communication protocol and framework designed to connect custom physical input devices (like buttons, sliders, and encoders) with PC applications.

By defining the protocol using [Protocol Buffers](https://protobuf.dev/), it enables type-safe and efficient communication between device firmware written in C++ and PC applications written in Python or TypeScript.

This repository contains the OMIP specification definition, as well as concrete implementation examples and related tools.

### Key Components

*   **Open Modular Input Protocol (OMIP)**
    *   The `.proto` file that defines the protocol specification. It defines messages for input from the device (Input) and feedback from the PC to the device (Feedback).
*   **M5Tab OMIP Implementation (`M5Tab_OMIP/`)**
    *   A comprehensive project that transforms M5Stack's `M5Tab` into a multi-function input device with a touchscreen (similar to a Stream Deck).
    *   **Firmware:** Runs on the M5Tab and sends touch inputs as OMIP messages.
    *   **PC Software:** A backend and UI that run on the PC. It receives input from the device to trigger PC key presses and sends icon images from the UI to the device.
*   **Joy-Con PC Utility (`pc_software/`)**
    *   A utility for connecting Nintendo Switch Joy-Cons to a PC and using them as a keyboard or mouse.
    *   **Note:** This tool is not directly related to OMIP and operates independently.
*   **Simple Hub Example (`firmware/master_hub/`)**
    *   A firmware implementation example of a minimal OMIP device with basic buttons and analog input.

---

## Architecture

The fundamental concept of OMIP is to clearly separate the roles between the device and the PC.

```
┌──────────────────┐      Serial Communication      ┌──────────────────┐      StdIO/WebSocket      ┌────────────────┐
│                  │        (OMIP Protocol)        │                  │          (JSON)          │                │
│  Device (C++)    ├───────────────────────────►  PC Backend (Python) ├──────────────────────►   UI (TypeScript)  │
│ (M5Tab, etc.)    │                           │                  │                          │ (Electron/Vue) │
│                  │◄───────────────────────────┤  (backend.py)    │◄──────────────────────┤                │
└──────────────────┘                           └──────────────────┘                          └────────────────┘
```

1.  **Device (Firmware):**
    *   Detects physical events like a button press or encoder turn.
    *   Encodes the event into an OMIP message, such as `InputDigital` or `InputAnalog`.
    *   Sends the encoded data to the PC via the serial port.
    *   Receives messages like `FeedbackImage` from the PC to update its display.
2.  **PC Backend:**
    *   Monitors the serial port, receiving and decoding OMIP messages.
    *   Based on the received input, controls the PC's keyboard or mouse using libraries like `pynput`.
    *   Receives instructions from the UI and sends OMIP messages (e.g., icon images) to the device.
    *   Communicates with the UI in JSON format via standard I/O (stdin/stdout) or WebSockets.
3.  **UI (Frontend):**
    *   Provides a graphical interface for configuring the device (e.g., assigning keys to buttons).
    *   Sends configuration information to the backend.

---

## Component Details

### 1. M5Tab OMIP Implementation

Transforms the M5Tab into a powerful input device for executing shortcuts and controlling applications.

![M5Tab Demo](https://place-hold.it/600x400?text=M5Tab+OMIP+Demo)

#### How to Run

**Step 1: Flash the Firmware**

Flash the OMIP-compatible firmware onto the M5Tab.
For detailed instructions, please refer to the project's original document, the [M5Tab Development Guide](M5Tab_OMIP/readme.md). (Note: This document will be reorganized into a more concise setup guide in the future).

**Step 2: Run the PC Application**

Start the PC backend and UI.

1.  **Set up Python Environment:**
    In the `M5Tab_OMIP/pc_software/` directory, create a virtual environment and install dependencies.
    ```shell
    # Windows
    python -m venv venv
    venv\Scripts\activate
    pip install -r requirements.txt

    # macOS / Linux
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

2.  **Set up UI:**
    In the `M5Tab_OMIP/pc_software/ui/` directory, install Node.js dependencies.
    ```shell
    cd M5Tab_OMIP/pc_software/ui
    npm install
    ```

3.  **Launch the Application:**
    Run the `start-test-env.bat` script located in `M5Tab_OMIP/pc_software/`.
    This will simultaneously launch the Python backend script and the Electron application for the UI in development mode.

    Once launched, select the serial port to which the M5Tab is connected in the UI and press the "Connect" button to start communication with the device.

### 2. Joy-Con PC Utility

A tool for using Joy-Cons as PC input devices. You can freely map button and stick inputs to keyboard shortcuts and mouse movements.

#### How to Run

1.  **Set up Python Environment:**
    In the `pc_software/` directory at the root of the repository, create a virtual environment and install dependencies.
    ```shell
    # Windows
    cd pc_software
    python -m venv venv
    venv\Scripts\activate
    pip install -r requirements.txt

    # macOS / Linux
    cd pc_software
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

2.  **Launch the Application:**
    Run `main.py` to start the web server.
    ```shell
    python main.py
    ```
    Access `http://127.0.0.1:8000` in your browser to see the configuration screen for connected Joy-Cons.

---

## Development

### Updating Protocol Definitions

The OMIP specification is defined in `proto/omip.proto`. If you modify this file, you must regenerate the source code for each language.

**Generating Python (`_pb2.py`):**

You will need `protoc` (the Protocol Buffer Compiler).
```shell
# Run from the repository root
protoc --python_out=. proto/omip.proto
```
This will generate or update `omip_pb2.py`.

**Generating C/C++ (`.pb.c`, `.pb.h`):**

Code generation for C uses `nanopb`.

1.  Set up `nanopb`. (See the [official guide](https://jpa.kapsi.fi/nanopb/docs/generator.html))
2.  Run the following commands:
    ```shell
    # Run from the repository root
    nanopb_generator -I proto -D firmware/master_hub proto/omip.proto
    nanopb_generator -I proto -D M5Tab_OMIP/src proto/omip.proto
    ```
    This will generate or update the `.pb.c` and `.pb.h` files within each respective firmware project.
