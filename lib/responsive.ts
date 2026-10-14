import { useWindowDimensions } from "react-native";
import { breakpoints, contentMax, sidebar, space } from "@/constants/theme";

export type Layout = {
  width: number;
  isPhone: boolean;
  isTablet: boolean;
  /** Laptop and up (≥ 1024): sidebar + workspace. */
  isDesktop: boolean;
  /** Large desktop (≥ 1440): expanded sidebar, widest content. */
  isWide: boolean;
  /** Side navigation instead of the bottom tab bar. */
  sideNav: boolean;
  /** Width of the side navigation (0 when the bottom bar is used). */
  sidebarWidth: number;
  /** Width left for page content after the side navigation. */
  contentWidth: number;
  /** Horizontal page padding for this width. */
  pad: number;
  /** Max content width (centred) for this width. */
  maxWidth: number;
  /** Two columns are worth it at this width. */
  twoCol: boolean;
};

export function layoutFor(width: number): Layout {
  const isWide = width >= breakpoints.desktop;
  const isDesktop = width >= breakpoints.laptop;
  const isTablet = !isDesktop && width >= breakpoints.tablet;
  const sidebarWidth = isWide ? sidebar.desktop : isDesktop ? sidebar.laptop : 0;
  return {
    width,
    isPhone: !isDesktop && !isTablet,
    isTablet,
    isDesktop,
    isWide,
    sideNav: isDesktop,
    sidebarWidth,
    contentWidth: width - sidebarWidth,
    pad: isWide ? space.xxxl : isDesktop ? space.xxl : isTablet ? space.xl : space.lg,
    maxWidth: isWide ? contentMax.desktop : isDesktop ? contentMax.laptop : isTablet ? contentMax.tablet : width,
    twoCol: width >= breakpoints.tablet,
  };
}

export function useLayout(): Layout {
  const { width } = useWindowDimensions();
  return layoutFor(width);
}
