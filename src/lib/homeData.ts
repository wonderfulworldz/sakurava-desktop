import { Image, Plus, Star, UserRound, Video } from "lucide-react";

export const summaryCards = [
  {
    label: "Videos",
    value: "24",
    detail: "Mock catalog count",
    icon: Video,
  },
  {
    label: "Images",
    value: "24",
    detail: "Mock catalog count",
    icon: Image,
  },
  {
    label: "Performers",
    value: "24",
    detail: "Mock profile count",
    icon: UserRound,
  },
  {
    label: "Favorites",
    value: "8",
    detail: "Placeholder count",
    icon: Star,
  },
];

export const quickActions = [
  {
    label: "Add Video",
    detail: "Open the video create route stub",
    to: "/videos/new",
    icon: Plus,
  },
  {
    label: "Add Image",
    detail: "Open the image create route stub",
    to: "/images/new",
    icon: Plus,
  },
  {
    label: "Add Performer",
    detail: "Open the performer create route stub",
    to: "/performers/new",
    icon: Plus,
  },
];

export const continueItems = [
  "Recent videos placeholder",
  "Recent images placeholder",
  "Recent performers placeholder",
];

export const recentlyAdded = [
  "Video draft placeholder",
  "Image set placeholder",
  "Performer profile placeholder",
  "Favorite item placeholder",
];
