import { Image, Plus, Star, UserRound, Video } from "lucide-react";

export const summaryCards = [
  {
    label: "Videos",
    value: "0",
    detail: "No saved videos yet",
    icon: Video,
  },
  {
    label: "Images",
    value: "0",
    detail: "No saved images yet",
    icon: Image,
  },
  {
    label: "Performers",
    value: "0",
    detail: "No saved performers yet",
    icon: UserRound,
  },
  {
    label: "Favorites",
    value: "0",
    detail: "No favorites yet",
    icon: Star,
  },
];

export const quickActions = [
  {
    label: "Add Video",
    detail: "Create a new video catalog item",
    to: "/videos/new",
    icon: Plus,
  },
  {
    label: "Add Image",
    detail: "Create a new image catalog item",
    to: "/images/new",
    icon: Plus,
  },
  {
    label: "Add Performer",
    detail: "Create a new performer profile",
    to: "/performers/new",
    icon: Plus,
  },
];

export const continueItems: string[] = [];

export const recentlyAdded: string[] = [];
