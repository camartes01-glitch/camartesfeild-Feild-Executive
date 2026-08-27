import { VENDORS } from "@/lib/vendors-seed";
import type {
  AppState,
  FieldTask,
  FieldUser,
  LeaveRequest,
  Place,
  Shift,
  TeamMate,
} from "@/lib/types";

export const BANJARA: Place = {
  id: "store-banjara",
  name: "Camartes Rental Hub — Banjara Hills",
  address: "Road No. 12, Banjara Hills, Hyderabad 500034",
  area: "Banjara Hills",
  phone: "+91 40 4855 2100",
  geo: { lat: 17.4126, lng: 78.4483 },
};

export const HITEC: Place = {
  id: "store-hitec",
  name: "Camartes Rental Hub — HITEC City",
  address: "Cyber Towers lane, HITEC City, Hyderabad 500081",
  area: "HITEC City",
  phone: "+91 40 4855 2200",
  geo: { lat: 17.4483, lng: 78.3816 },
};

const GACHIBOWLI: Place = {
  id: "cust-gachibowli",
  name: "A. Rao — Prestige High Fields",
  address: "Flat 12B, Prestige High Fields, Gachibowli, Hyderabad 500032",
  area: "Gachibowli",
  phone: "+91 98765 44110",
  geo: { lat: 17.4401, lng: 78.3489 },
};

const JUBILEE: Place = {
  id: "cust-jubilee",
  name: "Meera Films — Road 36",
  address: "Plot 8, Road No. 36, Jubilee Hills, Hyderabad 500033",
  area: "Jubilee Hills",
  phone: "+91 98490 22018",
  geo: { lat: 17.4239, lng: 78.407 },
};

const MADHAPUR: Place = {
  id: "cust-madhapur",
  name: "Kiran Studio — Ayyappa Society",
  address: "3rd floor, Ayyappa Society, Madhapur, Hyderabad 500081",
  area: "Madhapur",
  phone: "+91 90000 11882",
  geo: { lat: 17.4486, lng: 78.3908 },
};

const KONDAPUR: Place = {
  id: "cust-kondapur",
  name: "Sana Weddings — Botanical Garden Rd",
  address: "Villa 21, Botanical Garden Road, Kondapur, Hyderabad 500084",
  area: "Kondapur",
  phone: "+91 99122 55670",
  geo: { lat: 17.4676, lng: 78.3677 },
};

const SECUNDERABAD: Place = {
  id: "cust-secunderabad",
  name: "Naveen — Paradise Circle",
  address: "House 4-1-22, MG Road, Secunderabad 500003",
  area: "Secunderabad",
  phone: "+91 98660 33421",
  geo: { lat: 17.4399, lng: 78.4983 },
};

export const USERS: FieldUser[] = [
  {
    id: "fe-rahul",
    name: "Rahul Sharma",
    email: "rahul@camartes.com",
    password: "field2026",
    phone: "+91 90000 44121",
    employeeId: "CM-FE-104",
    role: "Field Executive",
    hub: "Hyderabad",
    avatarInitials: "RS",
    employment: "Camartes employee",
  },
  {
    id: "fe-priya",
    name: "Priya Nair",
    email: "priya@camartes.com",
    password: "field2026",
    phone: "+91 90000 44122",
    employeeId: "CM-FE-109",
    role: "Field Executive",
    hub: "Hyderabad",
    avatarInitials: "PN",
    employment: "Camartes employee",
  },
  {
    id: "fe-arjun",
    name: "Arjun Reddy",
    email: "arjun@camartes.com",
    password: "field2026",
    phone: "+91 90000 44123",
    employeeId: "CM-FE-112",
    role: "Field Executive",
    hub: "Hyderabad",
    avatarInitials: "AR",
    employment: "Camartes employee",
  },
];

function event(id: string, at: string, label: string) {
  return { id, at, label };
}

const TASKS: FieldTask[] = [
  {
    id: "TSK-4811",
    kind: "address_verification",
    title: "Verify booking address",
    bookingRef: "BK-88210",
    customerName: "A. Rao",
    customerPhone: GACHIBOWLI.phone!,
    status: "assigned",
    scheduledFor: "2026-08-26T10:30:00+05:30",
    store: BANJARA,
    customerPlace: GACHIBOWLI,
    items: [],
    notes:
      "Confirm tower, flat number and access. Photograph nameplate / tower board with geotag.",
    photos: [],
    timeline: [
      event("e1", "2026-08-26T07:10:00+05:30", "Assigned from dispatch"),
    ],
    addressMatch: "unverified",
  },
  {
    id: "TSK-4812",
    kind: "delivery",
    title: "Deliver Sony A7 IV wedding kit",
    bookingRef: "BK-88244",
    customerName: "Meera Films",
    customerPhone: JUBILEE.phone!,
    status: "assigned",
    scheduledFor: "2026-08-26T12:00:00+05:30",
    store: BANJARA,
    customerPlace: JUBILEE,
    items: [
      {
        sku: "BODY-A7IV",
        name: "Sony A7 IV body",
        serial: "SN-A7IV-4412",
        condition: "good",
        qty: 1,
      },
      {
        sku: "LENS-2470GM",
        name: "Sony FE 24-70mm f/2.8 GM II",
        serial: "SN-2470-118",
        condition: "good",
        qty: 1,
      },
      {
        sku: "STAB-RS3",
        name: "DJI RS 3 gimbal",
        serial: "SN-RS3-902",
        condition: "good",
        qty: 1,
      },
    ],
    notes:
      "Pick kit from Banjara Hills hub, seal bag, deliver to Meera Films. Photo at store pickup and at customer handover.",
    photos: [],
    timeline: [
      event("e1", "2026-08-26T07:12:00+05:30", "Kit reserved at Banjara hub"),
    ],
    otpCode: "4821",
    scannedSerials: [],
    slaMinutes: 90,
  },
  {
    id: "TSK-4813",
    kind: "return",
    title: "Collect lighting return",
    bookingRef: "BK-87901",
    customerName: "Kiran Studio",
    customerPhone: MADHAPUR.phone!,
    status: "assigned",
    scheduledFor: "2026-08-26T16:00:00+05:30",
    store: HITEC,
    customerPlace: MADHAPUR,
    items: [
      {
        sku: "LIGHT-AD600",
        name: "Godox AD600Pro",
        serial: "SN-AD600-55",
        condition: "good",
        qty: 2,
      },
      {
        sku: "SOFT-120",
        name: "120cm octabox + grid",
        serial: "SN-OCT-12",
        condition: "fair",
        qty: 1,
      },
    ],
    notes:
      "Inspect for damage at customer site, photograph kit, return to HITEC City hub.",
    photos: [],
    timeline: [
      event("e1", "2026-08-25T18:40:00+05:30", "Return window confirmed"),
    ],
    otpCode: "9033",
    scannedSerials: [],
    slaMinutes: 75,
  },
  {
    id: "TSK-4814",
    kind: "inventory",
    title: "Cycle count — HITEC hub lenses",
    bookingRef: "INV-0826",
    customerName: "Camartes HITEC Hub",
    customerPhone: HITEC.phone!,
    status: "assigned",
    scheduledFor: "2026-08-26T18:30:00+05:30",
    store: HITEC,
    customerPlace: HITEC,
    items: [
      {
        sku: "LENS-135GM",
        name: "Sony FE 135mm f/1.8 GM",
        serial: "SN-135-07",
        condition: "good",
        qty: 2,
      },
      {
        sku: "LENS-70200",
        name: "Sony FE 70-200mm f/2.8 GM OSS II",
        serial: "SN-70200-03",
        condition: "good",
        qty: 1,
      },
      {
        sku: "BODY-R5",
        name: "Canon EOS R5",
        serial: "SN-R5-221",
        condition: "good",
        qty: 3,
      },
      {
        sku: "LIGHT-600D",
        name: "Aputure 600d Pro",
        serial: "SN-600D-14",
        condition: "good",
        qty: 2,
      },
    ],
    notes:
      "Count on-shelf units, photograph bay, flag missing or damaged serials.",
    photos: [],
    timeline: [
      event("e1", "2026-08-26T06:00:00+05:30", "Weekly count scheduled"),
    ],
    inventoryCounted: {},
  },
  {
    id: "TSK-4790",
    kind: "delivery",
    title: "Deliver cinema lights — Kondapur",
    bookingRef: "BK-87880",
    customerName: "Sana Weddings",
    customerPhone: KONDAPUR.phone!,
    status: "completed",
    scheduledFor: "2026-08-25T11:00:00+05:30",
    store: HITEC,
    customerPlace: KONDAPUR,
    items: [
      {
        sku: "LIGHT-600D",
        name: "Aputure 600d Pro",
        serial: "SN-600D-09",
        condition: "good",
        qty: 2,
      },
    ],
    notes: "Completed yesterday. Handover signed on site.",
    photos: [],
    timeline: [
      event("e1", "2026-08-25T09:05:00+05:30", "Picked at HITEC hub"),
      event("e2", "2026-08-25T10:48:00+05:30", "Delivered and geotagged"),
    ],
    startedAt: "2026-08-25T09:05:00+05:30",
    completedAt: "2026-08-25T10:48:00+05:30",
    customerConfirmed: true,
  },
  {
    id: "TSK-4788",
    kind: "address_verification",
    title: "Verify Secunderabad address",
    bookingRef: "BK-87712",
    customerName: "Naveen",
    customerPhone: SECUNDERABAD.phone!,
    status: "completed",
    scheduledFor: "2026-08-25T15:30:00+05:30",
    store: BANJARA,
    customerPlace: SECUNDERABAD,
    items: [],
    notes: "Nameplate matched booking.",
    photos: [],
    timeline: [
      event("e1", "2026-08-25T15:12:00+05:30", "On site"),
      event("e2", "2026-08-25T15:28:00+05:30", "Address matched"),
    ],
    completedAt: "2026-08-25T15:28:00+05:30",
    addressMatch: "match",
  },
  {
    id: "TSK-4820",
    kind: "vendor_visit",
    title: "Onboard G Anil Kumar rental store (camartes.com)",
    bookingRef: "MKT-104",
    customerName: "G Anil Kumar",
    customerPhone: "+91 90895 67890",
    status: "assigned",
    scheduledFor: "2026-08-27T11:00:00+05:30",
    store: BANJARA,
    customerPlace: {
      id: "user_c3d1003a9d0d",
      name: "G Anil Kumar",
      address: "H. NO 8-7171/6/1 501 PNO 1 SY NO 47, Hyderabad",
      area: "Hyderabad",
      phone: "+91 90895 67890",
      geo: { lat: 17.385, lng: 78.4867 },
    },
    items: [],
    notes:
      "Live Camartes business listing. Confirm kit, photograph storefront, complete onboarding if GST/KYC is pending.",
    photos: [],
    timeline: [event("e1", "2026-08-27T07:20:00+05:30", "Assigned by Hyderabad city manager")],
    vendorId: "user_c3d1003a9d0d",
  },
  {
    id: "TSK-4821",
    kind: "vendor_visit",
    title: "Pitch Pixel LED Walls — WebLive + events",
    bookingRef: "MKT-105",
    customerName: "Arun Babu",
    customerPhone: "+91 98660 33421",
    status: "assigned",
    scheduledFor: "2026-08-27T15:30:00+05:30",
    store: HITEC,
    customerPlace: {
      id: "vn-led-pixel",
      name: "Pixel LED Walls",
      address: "Cyber Towers lane, HITEC City, Hyderabad",
      area: "HITEC City",
      phone: "+91 98660 33421",
      geo: { lat: 17.4501, lng: 78.3802 },
    },
    items: [],
    notes: "Onboard LED wall and event-stage inventory onto the Camartes vendor platform.",
    photos: [],
    timeline: [event("e1", "2026-08-27T07:22:00+05:30", "Assigned by Hyderabad city manager")],
    vendorId: "vn-led-pixel",
  },
];

export const TASK_IDS = TASKS.map((t) => t.id);

function iso(d: Date) {
  return d.toISOString();
}

function shift(date: string, inH: number, inM: number, outH: number, outM: number): Shift {
  const clockIn = new Date(`${date}T${String(inH).padStart(2, "0")}:${String(inM).padStart(2, "0")}:00+05:30`);
  const clockOut = new Date(`${date}T${String(outH).padStart(2, "0")}:${String(outM).padStart(2, "0")}:00+05:30`);
  return {
    id: `sh-${date}`,
    date,
    clockIn: iso(clockIn),
    clockOut: iso(clockOut),
    clockInGeo: BANJARA.geo,
    clockOutGeo: BANJARA.geo,
  };
}

const SHIFTS: Shift[] = [
  shift("2026-08-03", 9, 4, 18, 12),
  shift("2026-08-04", 8, 58, 18, 5),
  shift("2026-08-05", 9, 10, 18, 40),
  shift("2026-08-06", 9, 2, 18, 8),
  shift("2026-08-07", 8, 50, 17, 55),
  shift("2026-08-10", 9, 6, 18, 18),
  shift("2026-08-11", 9, 0, 18, 2),
  shift("2026-08-12", 8, 55, 19, 10),
  shift("2026-08-13", 9, 12, 18, 22),
  shift("2026-08-14", 9, 1, 18, 0),
  shift("2026-08-17", 8, 48, 18, 15),
  shift("2026-08-18", 9, 3, 18, 7),
  shift("2026-08-19", 9, 8, 18, 33),
  shift("2026-08-20", 8, 59, 18, 11),
  shift("2026-08-21", 9, 5, 17, 50),
  shift("2026-08-24", 9, 0, 18, 4),
  shift("2026-08-25", 8, 52, 18, 28),
];

const LEAVES: LeaveRequest[] = [
  {
    id: "LV-201",
    type: "casual",
    from: "2026-08-28",
    to: "2026-08-28",
    days: 1,
    reason: "Family function in Warangal. Back on 29th.",
    status: "pending",
    submittedAt: "2026-08-22T11:20:00+05:30",
  },
  {
    id: "LV-188",
    type: "earned",
    from: "2026-09-10",
    to: "2026-09-11",
    days: 2,
    reason: "Onam travel.",
    status: "approved",
    submittedAt: "2026-08-08T09:40:00+05:30",
  },
  {
    id: "LV-160",
    type: "sick",
    from: "2026-08-01",
    to: "2026-08-01",
    days: 1,
    reason: "Fever.",
    status: "approved",
    submittedAt: "2026-08-01T07:15:00+05:30",
  },
];

export function createInitialState(): AppState {
  return {
    userId: null,
    language: "en",
    deviceBoundId: null,
    tasks: structuredClone(TASKS),
    shifts: structuredClone(SHIFTS),
    leaves: structuredClone(LEAVES),
    pings: [],
    damages: [],
    expenses: [
      {
        id: "EX-01",
        date: "2026-08-25",
        km: 18.4,
        amountInr: 220,
        note: "Auto Banjara → Kondapur delivery",
        status: "approved",
      },
    ],
    audit: [{ id: "a0", at: "2026-08-26T07:00:00+05:30", label: "Hyderabad hub roster published" }],
    offlineQueue: [],
    notices: [
      {
        id: "n1",
        title: "Wedding kit SLA",
        body: "BK-88244 Meera Films must be on site by 12:00. OTP 4821.",
        at: "2026-08-26T07:15:00+05:30",
        read: false,
      },
      {
        id: "n3",
        title: "Vendor market",
        body: "Vendors tab now lists live businesses and freelancers from camartes.com. Visit G Anil Kumar (Hyderabad rental) and Pixel LED today.",
        at: "2026-08-27T07:30:00+05:30",
        read: false,
      },
    ],
    training: [
      {
        id: "tr1",
        title: "Aputure 600d — transport",
        body: "Always cap the COB, lock the yoke, never lay the head on the LED.",
        done: false,
      },
      {
        id: "tr2",
        title: "Gimbal handover",
        body: "Balance check on site. Note any bent axis before the customer signs OTP.",
        done: true,
      },
    ],
    leavePolicy: { casual: 6, sick: 6, earned: 12 },
    vendors: structuredClone(VENDORS),
    vendorVisits: [],
  };
}

export const TEAM: TeamMate[] = [
  {
    id: "fe-rahul",
    name: "Rahul Sharma",
    employeeId: "CM-FE-104",
    status: "on_task",
    area: "Banjara Hills",
    geo: BANJARA.geo,
  },
  {
    id: "fe-priya",
    name: "Priya Nair",
    employeeId: "CM-FE-109",
    status: "on_shift",
    area: "HITEC City",
    geo: HITEC.geo,
  },
  {
    id: "fe-arjun",
    name: "Arjun Reddy",
    employeeId: "CM-FE-112",
    status: "on_task",
    area: "Madhapur",
    geo: { lat: 17.4486, lng: 78.3908 },
  },
];

export const ROSTER: { date: string; window: string; hub: string }[] = [
  { date: "2026-08-26", window: "09:00–18:00", hub: "Banjara Hills" },
  { date: "2026-08-27", window: "09:00–18:00", hub: "HITEC City" },
  { date: "2026-08-28", window: "Off / pending leave", hub: "—" },
  { date: "2026-08-29", window: "09:00–18:00", hub: "Banjara Hills" },
  { date: "2026-08-31", window: "10:00–19:00 (wedding OT)", hub: "HITEC City" },
];

export const LOCATION_PRESETS: { id: string; label: string; lat: number; lng: number }[] =
  [
    { id: "live", label: "Device GPS", lat: 0, lng: 0 },
    { id: "banjara", label: "Banjara Hills hub", lat: BANJARA.geo.lat, lng: BANJARA.geo.lng },
    { id: "hitec", label: "HITEC City hub", lat: HITEC.geo.lat, lng: HITEC.geo.lng },
    { id: "gachibowli", label: "Gachibowli customer", lat: GACHIBOWLI.geo.lat, lng: GACHIBOWLI.geo.lng },
    { id: "jubilee", label: "Jubilee Hills customer", lat: JUBILEE.geo.lat, lng: JUBILEE.geo.lng },
    { id: "madhapur", label: "Madhapur customer", lat: MADHAPUR.geo.lat, lng: MADHAPUR.geo.lng },
    { id: "enroute", label: "En route (Road 12)", lat: 17.418, lng: 78.43 },
  ];
