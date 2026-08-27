# Camartes Field (React Native)

Field executive app for [camartes.com](https://camartes.com) staff in Hyderabad: address verification, kit pickup/delivery, returns, store inventory, live location, attendance, leave, and geotagged photos.

Brand colors: `#FF6B35` orange on `#FFF7ED` cream.

## Run

```bash
npm install
npx expo start
```

Then:

- press `w` for web preview
- scan the QR code with **Expo Go** on Android or iOS
- `npx expo start --android` / `--ios` for a simulator

```bash
npx expo start --web --port 43148
```

## Demo login

| Email | Password |
| --- | --- |
| `rahul@camartes.com` | `field2026` |
| `priya@camartes.com` | `field2026` |

If GPS is unavailable, set **Location source** on Home to a Hyderabad hub or customer pin.

## Android / iOS binary

```bash
npx expo prebuild
npx expo run:android
```

Or use [EAS Build](https://docs.expo.dev/build/setup/). This is a debug/demo app, not a Play Store release.

## Stack

Expo SDK 57, Expo Router, React Native, expo-location, expo-image-picker, AsyncStorage.
