import type { PortalPageTheme } from "@workspace/api-client-react";

export const PAGE_THEME_SCREENS = [
  ["landing", "Home page"],
  ["sign-in", "Sign-in page"],
  ["sign-up", "Account creation page"],
  ["auth-complete", "Authentication completion"],
  ["dashboard", "Applicant dashboard"],
  ["application-form", "Application loading and notice screens"],
  ["category-entry-1", "Category One entry form"],
  ["category-entry-2", "Category Two entry form"],
  ["category-entry-3", "Category Three entry form"],
  ["category-entry-4", "Category Four entry form"],
  ...Array.from({ length: 8 }, (_, index) => [
    `workflow-step-${index + 1}`,
    `Enrollment step ${index + 1}`,
  ] as const),
  ["application-status", "Application status"],
  ["support", "Applicant support"],
  ["admin-overview", "Admin overview"],
  ["admin-review", "Admin review queue"],
  ["admin-users", "Admin user management"],
  ["admin-settings", "Admin portal settings"],
  ["admin-application-review", "Admin application review"],
  ["admin-support", "Admin support inbox"],
  ["not-found", "Not-found page"],
] as const;

export const DEFAULT_PAGE_THEME: PortalPageTheme = {
  mode: "inherit",
  color: "#F4F7F9",
  blendColor: "#FFFFFF",
  angle: 135,
};

export function normalizePageThemes(
  themes?: Record<string, PortalPageTheme>,
): Record<string, PortalPageTheme> {
  const normalized = { ...(themes ?? {}) };
  for (const [key] of PAGE_THEME_SCREENS) {
    normalized[key] = themes?.[key] ?? { ...DEFAULT_PAGE_THEME };
  }
  return normalized;
}

export function pageThemeBackground(theme?: PortalPageTheme): string | undefined {
  if (!theme || theme.mode === "inherit") return undefined;
  if (theme.mode === "solid") return theme.color;
  return `linear-gradient(${theme.angle}deg, ${theme.color}, ${theme.blendColor})`;
}

export function pageThemeKeyForRoute(path: string): string {
  const route = path.split("?")[0].replace(/\/+$/, "") || "/";
  if (route === "/") return "landing";
  if (route.startsWith("/sign-in")) return "sign-in";
  if (route.startsWith("/sign-up")) return "sign-up";
  if (route === "/auth/complete") return "auth-complete";
  if (route === "/dashboard") return "dashboard";
  if (route.startsWith("/apply/")) return "application-form";
  if (route.startsWith("/applications/")) return "application-status";
  if (route === "/support") return "support";
  if (route === "/admin") return "admin-overview";
  if (route === "/admin/review") return "admin-review";
  if (route === "/admin/users") return "admin-users";
  if (route === "/admin/settings") return "admin-settings";
  if (route.startsWith("/admin/applications/")) return "admin-application-review";
  if (route === "/admin/support") return "admin-support";
  return "not-found";
}
