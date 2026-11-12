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

Website: https://lanshare-ftp.byteworkstation.online
- **Launch at system startup**: starts in the background (system tray) when you log in
- **Start sharing automatically**: starts the server as soon as the app opens
- A system tray icon to start or stop the server and to quit
- **Keep running in the background:** if you close the window while sharing, the app asks whether to keep the server running in the background or stop it and quit. You can tick "Remember my choice" or change it later under *When I close the window*.
- **Update notifications:** checks GitHub Releases at launch, every 6 hours, and when the internet comes back. When a new version is out, you get a notification, an in-app banner and a tray item that downloads the right installer for your system. You can skip a version or turn notifications off.

### Auto-start details
| OS | How it's registered |
|---|---|
| Windows | Login item in the registry (Task Manager → Startup apps) |
| macOS | Login item (System Settings → General → Login Items) |
| Linux | `~/.config/autostart/lanshare-ftp.desktop` |

On Linux, enable this from the AppImage or `.deb` build, not `npm start`, so the entry points to the installed app. If you move the AppImage, open it once so it can update the entry.

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
