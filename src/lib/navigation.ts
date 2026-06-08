export const primarySidebarItems = [
  {
    label: "Home",
    labelKey: "nav.home",
    to: "/",
    icon: "home",
  },
  {
    label: "Videos",
    labelKey: "nav.videos",
    to: "/videos",
    icon: "videos",
  },
  {
    label: "Images",
    labelKey: "nav.images",
    to: "/images",
    icon: "images",
  },
  {
    label: "Performers",
    labelKey: "nav.performers",
    to: "/performers",
    icon: "performers",
  },
  {
    label: "Categories",
    labelKey: "nav.categories",
    to: "/settings/category-management",
    icon: "categories",
  },
] as const;

export const lowerSidebarItems = [
  {
    label: "Glossary",
    labelKey: "nav.glossary",
    to: "/glossary",
    icon: "glossary",
  },
  {
    label: "Settings",
    labelKey: "nav.settings",
    to: "/settings",
    icon: "settings",
  },
] as const;

export const sidebarItems = [
  ...primarySidebarItems,
  ...lowerSidebarItems,
] as const;
