import { Image, View, type ViewStyle } from "react-native";

/*
 * Brand artwork for the Home dashboard and sidebar (assets/images/brand). Decorative only: hidden from screen
 * readers and never interactive, so it can sit behind content without affecting layout or touch handling.
 */

function Hidden({ style, children }: { style?: ViewStyle; children: React.ReactNode }) {
  return (
    <View style={style} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {children}
    </View>
  );
}

/* ── Raster brand artwork (assets/images/brand), used where the design calls for photographic scenes. ── */

const HERO = require("../assets/images/brand/home-hero.png");
const SIDEBAR = require("../assets/images/brand/sidebar-scene.png");
const ROUTE = require("../assets/images/brand/route-scene.png");
const ROUTE_MAP = require("../assets/images/brand/route-map.png");
const NEXT_MAP = require("../assets/images/brand/next-map.png");

function Art({ source, width, height, style }: { source: number; width: number; height: number; style?: ViewStyle }) {
  return (
    <Hidden style={style}>
      <Image source={source} style={{ width, height }} resizeMode="cover" />
    </Hidden>
  );
}

/** Field photographer over the Hyderabad skyline; fades into white on its left edge. 611×234 source. */
export const HeroPhoto = ({ height, style }: { height: number; style?: ViewStyle }) => <Art source={HERO} width={Math.round((height * 611) / 234)} height={height} style={style} />;
/** Soft monochrome photographer scene for the sidebar. 282×322 source. */
export const SidebarScene = ({ width, style }: { width: number; style?: ViewStyle }) => <Art source={SIDEBAR} width={width} height={Math.round((width * 322) / 282)} style={style} />;
/** City road scene along the bottom of the route card. 518×178 source. */
export const RouteScene = ({ width, style }: { width: number; style?: ViewStyle }) => <Art source={ROUTE} width={width} height={Math.round((width * 178) / 518)} style={style} />;
/** Folded map with pin (empty route). 162×158 source. */
export const RouteMap = ({ size = 130, style }: { size?: number; style?: ViewStyle }) => <Art source={ROUTE_MAP} width={size} height={Math.round((size * 158) / 162)} style={style} />;
/** Map thumbnail with route and pin (next stop). 142×104 source. */
export const NextMap = ({ width = 150, style }: { width?: number; style?: ViewStyle }) => <Art source={NEXT_MAP} width={width} height={Math.round((width * 104) / 142)} style={style} />;

const JOBS_BANNER = require("../assets/images/brand/jobs-banner.png");
const JOB_PICKUP = require("../assets/images/brand/job-pickup.png");
const JOB_DELIVERY = require("../assets/images/brand/job-delivery.png");

/** Camera kit over the city at sunset, for the Jobs header; fades into the canvas on its left. 935×256 source. */
export const JobsBanner = ({ height, style }: { height: number; style?: ViewStyle }) => <Art source={JOBS_BANNER} width={Math.round((height * 935) / 256)} height={height} style={style} />;
/** Job-type artwork for the top-right of a job card: kit bags for pickups, a hand-over for deliveries. */
export function jobArt(kind: string): { source: number; ratio: number } | null {
  if (kind === "pickup") return { source: JOB_PICKUP, ratio: 225 / 236 };
  if (kind === "delivery") return { source: JOB_DELIVERY, ratio: 327 / 236 };
  return null;
}
export const JobArt = ({ kind, height, style }: { kind: string; height: number; style?: ViewStyle }) => {
  const a = jobArt(kind);
  return a ? <Art source={a.source} width={Math.round(height * a.ratio)} height={height} style={style} /> : null;
};

const ONBOARD_BANNER = require("../assets/images/brand/onboard-banner.png");
const ONBOARD_EMPTY = require("../assets/images/brand/onboard-empty.png");
export const ONBOARD_CTA = require("../assets/images/brand/onboard-cta.png");

/** Executive with a tablet in a camera store, for the Onboard header. 894×232 source. */
export const OnboardBanner = ({ height, style }: { height: number; style?: ViewStyle }) => <Art source={ONBOARD_BANNER} width={Math.round((height * 894) / 232)} height={height} style={style} />;
/** Storefront with camera, tripod and map pins (no visits yet). 476×252 source. */
export const OnboardEmpty = ({ width, style }: { width: number; style?: ViewStyle }) => <Art source={ONBOARD_EMPTY} width={width} height={Math.round((width * 252) / 476)} style={style} />;

const ROSTER_BANNER = require("../assets/images/brand/roster-banner.png");
const ROSTER_EMPTY = require("../assets/images/brand/roster-empty.png");
const ROSTER_DECO = require("../assets/images/brand/roster-date-deco.png");

/** Executive with a tablet in a studio, for the Roster header. 1174x190 source. */
export const RosterBanner = ({ height, style }: { height: number; style?: ViewStyle }) => <Art source={ROSTER_BANNER} width={Math.round((height * 1174) / 190)} height={height} style={style} />;
/** Calendar with a cross and a camera (roster not published). 462x214 source. */
export const RosterEmpty = ({ width, style }: { width: number; style?: ViewStyle }) => <Art source={ROSTER_EMPTY} width={width} height={Math.round((width * 214) / 462)} style={style} />;
/** Faint wave and calendar outline for the right side of the date card. 592x132 source. */
export const RosterDateDeco = ({ height, style }: { height: number; style?: ViewStyle }) => <Art source={ROSTER_DECO} width={Math.round((height * 592) / 132)} height={height} style={style} />;

const PROFILE_HERO = require("../assets/images/brand/profile-hero.png");
const PROFILE_SHIFT = require("../assets/images/brand/profile-shift-empty.png");

/** Camera kit on a desk spanning the Profile header and identity card. 836x282 source. */
export const PROFILE_HERO_RATIO = 836 / 282;
export const ProfileHero = ({ height, style }: { height: number; style?: ViewStyle }) => <Art source={PROFILE_HERO} width={Math.round(height * PROFILE_HERO_RATIO)} height={height} style={style} />;
/** Clipboard and clock (no shifts yet). 160x56 source. */
export const ShiftEmptyArt = ({ width, style }: { width: number; style?: ViewStyle }) => <Art source={PROFILE_SHIFT} width={width} height={Math.round((width * 56) / 160)} style={style} />;
