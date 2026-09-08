# ShramSetu Mobile (Expo / React Native)

Native Android/iOS app for the Worker module, talking to the same FastAPI backend as the web PWA in `../frontend`. Same features: language selection, OTP-verified registration with a full migrant-worker profile, document wallet, AI welfare chatbot, and the grievance/complaint system.

## Stack

React Native + Expo (SDK 51) · NativeWind (Tailwind for RN) · React Navigation (native-stack + bottom-tabs) · axios · i18next · expo-secure-store (JWT) · expo-image-picker / expo-document-picker (uploads) · expo-speech (TTS)

## Setup

```bash
cd mobile
npm install
```

**Point the app at your backend.** The default (`http://localhost:8000/api/v1`) only works when running in a web browser or an emulator on the *same machine* as the backend. For a physical phone via Expo Go, the phone needs your computer's LAN IP:

```bash
# find your LAN IP (macOS/Linux: ifconfig, Windows: ipconfig), then:
EXPO_PUBLIC_API_URL=http://192.168.1.5:8000/api/v1 npx expo start
```

Or edit `extra.apiBaseUrl` in `app.json` directly. Make sure your phone and computer are on the same Wi-Fi network, and the backend is bound to `0.0.0.0` not just `127.0.0.1` (the FastAPI Dockerfile/uvicorn command already does this).

```bash
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS), or press `a` / `i` for an emulator.

## OTP verification in this environment

No paid SMS gateway is wired in (see the backend's `ConsoleSMSProvider`). In dev mode (`DEBUG=true` on the backend), the registration response includes a `dev_otp` field, and the app's OTP screen shows it directly on-screen with an amber "dev mode" banner so you can test the full flow without any SMS account. Remove/replace that dev-mode echo before shipping to real users — see the backend README.

## Voice input and output

Both directions work now:

- **Text-to-speech** (assistant reads answers aloud): `expo-speech`, fully on-device.
- **Speech-to-text** (tap the mic to ask by voice): records locally with `expo-av`, uploads the clip to the backend's `/chat/transcribe` endpoint, which transcribes it via **Groq's free-tier Whisper API** — the same API key already used for the chatbot's text generation, so no extra account or paid service is needed. This is not real-time streaming transcription; there's a short round-trip after you stop recording. True on-device STT would need a native module (`@react-native-voice/voice`) requiring a custom dev client, which doesn't run in plain Expo Go — this approach was chosen specifically so voice input works out of the box in Expo Go with zero extra native modules.

## Project structure

```
mobile/
├── App.tsx                    # entry point: i18n init, providers, navigator
├── src/
│   ├── screens/                # one file per screen
│   ├── navigation/RootNavigator.tsx   # auth stack vs authenticated tabs
│   ├── components/             # Screen, Buttons, FormField, ChipSelect, Card, StatusBadge
│   ├── store/                  # AuthContext (SecureStore-backed), ThemeContext (NativeWind colorScheme)
│   ├── api/client.ts           # axios instance, JWT injection
│   ├── i18n/                   # same 6-language registry + locale JSON as the web app
│   ├── hooks/useVoice.ts       # TTS wrapper
│   └── types/index.ts          # shared API types, including full worker profile
```

## Building for real devices (EAS)

This repo ships configured for Expo Go development. To produce an installable `.apk`/`.ipa`, you'll need an [EAS](https://docs.expo.dev/eas/) account (free tier available) and:

```bash
npm install -g eas-cli
eas build:configure
eas build --platform android --profile preview
```

That's outside what a free-tier Expo Go workflow needs for local testing/demoing, so it isn't pre-configured here — added on request.
