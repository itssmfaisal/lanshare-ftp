# LanShare FTP

A desktop FTP server with a clean dark UI for sharing a folder with other devices on your local network.

## Features
- One-click start/stop with live status and uptime
- Lists every LAN address (`ftp://192.168.x.x:port`), with copy buttons and a QR code for phones
- Anonymous access, or a username and password
- Read-only mode that blocks uploads, deletes, renames and new folders
- Live connected-device list, a download/upload counter, bytes transferred and an activity log
- Passive mode replies with the right interface IP for each client's subnet
- Settings are saved between runs

## Run
```bash
npm install
npm start
```
`npm start` uses `--no-sandbox` because Ubuntu blocks Electron's dev sandbox helper.

## Build installers
```bash
npm run dist     # AppImage + .deb on Linux (NSIS on Windows, DMG on macOS)
```

## Connecting
- **Windows:** File Explorer → address bar → `ftp://IP:2121`
- **macOS:** Finder → Go → Connect to Server (read-only in Finder)
- **Linux:** Files → Other Locations → `ftp://IP:2121`
- **Android/iOS:** scan the QR code with an FTP-capable file manager
- **Any OS:** FileZilla

Firewall: allow TCP port 2121 (or your chosen port) and the passive range 50000–50100.
