# GameHub Lite — Offline Local Server

A local API server that allows GameHub 5.1.4 to run fully offline without an account.

AN UPDATE IS IN ACTIVE DEVELOPMENT, AFTER WHICH TERMUX WILL NOT BE NEEDED, THE SERVER WILL BE LOCATED INSIDE THE APK, AND FRAMEGENRATION AND V2 DRIVER FROM GAMEHUB 6.0.4 WILL ALSO BE ADDED
## How It Works

The original GameHub app contacts the developer's servers on every launch to fetch
component lists (Wine, DXVK, Box64, GPU drivers), JWT tokens, and other data.
Without internet access or a valid account the app refuses to work.

This server intercepts all of those requests and responds locally — using static
JSON files from the `api/` directory and binary components from the `components/`
folder. The patched APK redirects every request from the developer's servers to
`127.0.0.1:8080`.

```
GameHub APK (patched)
        ↓
  127.0.0.1:8080
        ↓
   server.js (Express)
        ↓
  api/ + components/
```

---

## Requirements

- Android device with a Qualcomm Snapdragon SoC (Adreno GPU)
- [Termux](https://github.com/termux/termux-app/releases) — terminal emulator for Android
- Node.js 18+

---

## Installation

### 1. Install Termux

Download the latest release from [Termux GitHub Releases](https://github.com/termux/termux-app/releases)
and install the APK.

### 2. Install Node.js and Git

```bash
pkg update && pkg upgrade -y
pkg install nodejs git -y
```

### 3. Clone the repository

```bash
git clone https://github.com/teldommm/gamehub-offline ~/gamehub
cd ~/gamehub
```

### 4. Install dependencies

```bash
npm install
```

### 5. Download components

Download `components.tar.gz` from the
[v1.0 Release](https://github.com/teldommm/gamehub-offline/releases/tag/v1.0)
and extract it:

```bash
cd ~/gamehub
wget https://github.com/teldommm/gamehub-offline/releases/download/v1.0/components.tar.gz
tar -xzf components.tar.gz
rm components.tar.gz
```

### 6. Install the APK

Download `GameHub-Lite-v5.1.4-offline.apk` from the
[v1.0 Release](https://github.com/teldommm/gamehub-offline/releases/tag/v1.0)
and install it on your device.

### 7. Start the server

```bash
node ~/gamehub/server.js
```

The server starts on `127.0.0.1:8080`. Keep Termux running in the background.

### 8. Launch GameHub

Open the GameHub Lite app — it will automatically connect to the local server.

---

## Auto-start on Termux launch

To start the server automatically every time Termux opens, add the following
to `~/.bashrc`:

```bash
echo "node ~/gamehub/server.js &" >> ~/.bashrc
```

---

## Repository structure

```
gamehub/
├── server.js          — Express server (entry point)
├── package.json       — Node.js dependencies
├── api/               — static JSON API responses
│   ├── base/          — app base info
│   ├── components/    — component manifests
│   ├── simulator/     — emulator configuration
│   ├── jwt/           — auth token
│   └── ...
└── components/        — binary components (Wine, DXVK, Box64, drivers)
                         not stored in the repo — download from Releases
```

---

## Default components

| Type | Component |
|------|-----------|
| Wine Container | Proton 10 arm64x |
| DXVK | 2.6-1 async (GPLAsync) |
| GPU Driver | Turnip 8Elite-800.51 |
| Box64 / FEX | FEX 20260428 |

---

## Notes
Thanks to:
• https://github.com/gamehublite
• https://github.com/The412Banner
- The server binds to `127.0.0.1` only — not accessible from the network, local only
- All data is stored on your device — no external requests are made
- Termux must remain running in the background while using GameHub
- Tested on Snapdragon 8 Elite — other Snapdragon chips should work
  with appropriate driver selection
