# Camartes Field

Employee app for [Camartes](https://camartes.com) field executives at the Hyderabad hubs (Banjara Hills and HITEC City). Everyone who signs in is a Camartes employee — not a gig worker.

Brand: orange `#FF6B35` on cream `#FFF7ED`, matching camartes.com.

Field executives also visit nearby photography studios, freelance photographers, videographers, album designers, video editors, LED-wall and WebLive partners to market Camartes and onboard them onto the platform.

The **Services** tab uses the same vendor categories as [camartes.com Services](https://www.camartes.com): freelancer (Photographer, Videographer, Album Designer, Video Editor, Web/Live, LED Wall, Fly Cam / Drone) and business (Photography Firm, Camera Rental, Service Centres, Outdoor Studios, Editing Studios, Printing Labs, Software Services). Listings refresh from the public Camartes API when it is available.

SOS calls the **city manager nearest to your live GPS**. Device GPS is requested as soon as you sign in (the shift trail still records only while you are clocked in).

- Clock in with selfie and a 250 m hub geofence (override with a reason)
- Live device GPS; shift trail only while clocked in
- Address verification, store pickup → customer delivery, customer return → store, hub inventory
- Services: same vendor categories as camartes.com (freelancer + business)
- In-app handover PIN (generated on device, not SMS), serial match, WhatsApp updates, damage notes, geotagged photos
- Hours, roster, overtime, HR leave balances (casual / sick / earned)
- Hub team map, travel expenses, kit-care training, SOS to the nearest city manager, English / Hindi / Telugu

## Run

```bash
npm install
npx expo start
```

Scan the QR with **Expo Go**, or:

```bash
npx expo start --web --port 43148
```

## Demo logins

Password for all: `field2026`

- `rahul@camartes.com` (CM-FE-104)
- `priya@camartes.com` (CM-FE-109)
- `arjun@camartes.com` (CM-FE-112)

On delivery and return jobs, tap **Generate handover PIN** in the task. Show the 4-digit number to the customer and have them type it on the same phone. The PIN is created in the app — it is never sent by SMS.

If device GPS is unavailable, pick **Banjara Hills hub** on Home so punch-in is inside the geofence.

## Android APK (local)

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

The signed APK is `android/app/build/outputs/apk/release/app-release.apk` (debug keystore). Sideload on an arm64 phone; enable “install unknown apps”.

## Stack

Expo SDK 57, Expo Router, React Native, expo-location, expo-image-picker, NetInfo, AsyncStorage.
