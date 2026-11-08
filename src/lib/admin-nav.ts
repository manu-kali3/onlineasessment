/**
 * Admin navigation, in one place.
 *
 * It was previously copy-pasted into five page files, so adding a page meant
 * remembering four other files. Order is deliberate: daily-use destinations
 * first, configuration last.
 */
export const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/assessments", label: "Assessments" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/integrations", label: "Integrations" },
];
