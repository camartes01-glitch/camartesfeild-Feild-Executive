# Camartes Field

Field executive app for [camartes.com](https://camartes.com) staff who verify customer addresses, pick camera kits from rental hubs, deliver to customers, collect returns, and count inventory in Hyderabad.

This first slice runs in the browser (demo login, local storage). It is ready to connect to a Camartes backend later. UI colors follow camartes.com: `#FF6B35` orange on `#FFF7ED` cream.

## What it does

- **Login / logout** — demo accounts for two field executives
- **Live location** — device GPS, or simulated Hyderabad pins for desk testing
- **Attendance** — clock in/out with coordinates; monthly working days and hours
- **Leave request + planner** — calendar showing worked days vs leave
- **Four task types**
  1. Customer address verification
  2. Pickup from rental store → deliver to customer
  3. Pickup return from customer → drop at store
  4. Inventory count at the hub
- **Store ↔ customer distance** plus you → each stop (haversine) and Google Maps navigation
- **Geotagged photos** — camera capture stamped with lat/lng, accuracy, time, and checkpoint; metadata stored with the task

Suggested follow-on features (OTP handover, serial scan, dispatcher map, offline sync, etc.) are listed in-app under **More**.

## Demo login

| Email | Password | Role |
| --- | --- | --- |
| `rahul@camartes.com` | `field2026` | Field Executive |
| `priya@camartes.com` | `field2026` | Field Executive |

After sign-in, set **Location source** to a Hyderabad hub or customer if the browser has no GPS.

## Run locally

```bash
npm install
npm run dev -- --port 43147
```

Open [http://localhost:43147](http://localhost:43147).

```bash
npm run build
npm start -- --port 43147
```

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, Leaflet / OpenStreetMap.

Photos, shifts, leave and task progress persist in `localStorage` under `camartes-field-v1`.
