export type CollectionKind = "videos" | "images" | "performers";

type BaseCollectionItem = {
  key: string;
  sakuravaRef?: string;
  identityAliases?: string[];
  title: string;
  originalTitle: string;
  coverPath?: string;
  tableCoverPath?: string;
  favorite: boolean;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
  availability?: string;
  censorship?: string;
  publisherLabel?: string;
  releaseYear?: number | null;
  ratingAverage?: number | null;
  ratingBucket?: number | null;
  quality?: string | null;
  categories: string[];
};

export type VideoCollectionItem = BaseCollectionItem & {
  kind: "videos";
  code: string;
  duration: string;
  durationMinutes?: number | null;
  resolution?: string;
};

export type ImageCollectionItem = BaseCollectionItem & {
  kind: "images";
  code: string;
  imageCount: string;
  imageCountValue?: number | null;
  mainResolution?: string;
};

export type PerformerCollectionItem = {
  kind: "performers";
  key: string;
  sakuravaRef?: string;
  identityAliases?: string[];
  name: string;
  originalName: string;
  aliases: string;
  yearsActive: string;
  activeAges: string;
  coverPath?: string;
  tableCoverPath?: string;
  favorite: boolean;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
  status: string;
  gender?: string;
  birthDate?: string;
  nationality?: string;
  heightCm?: number | null;
  cupSize?: string;
  debutYear?: number | null;
  ratingAverage?: number | null;
  ratingBucket?: number | null;
  filmographyCount: string;
  filmographyCountValue?: number | null;
  pictorialsCount: string;
  pictorialsCountValue?: number | null;
  categories: string[];
};

export type CollectionItem =
  | VideoCollectionItem
  | ImageCollectionItem
  | PerformerCollectionItem;

export type CollectionConfig = {
  kind: CollectionKind;
  title: string;
  subtitle: string;
  countLabel: string;
  actionLabel: string;
  actionTo: string;
  searchPlaceholder: string;
  filterLabel: string;
  filterOptions: string[];
  sortLabel: string;
  sortOptions: string[];
  placeholderLabel: string;
  items: CollectionItem[];
};

const categories = ["Category A", "Category B"];

const videoDurations = [
  "02:45",
  "05:12",
  "03:28",
  "04:55",
  "01:33",
  "06:47",
  "02:07",
  "07:15",
  "03:02",
  "04:21",
  "05:39",
  "08:04",
  "02:54",
  "04:08",
  "06:11",
  "01:58",
  "03:44",
  "05:26",
  "07:02",
  "02:19",
  "04:33",
  "06:05",
  "03:16",
  "05:48",
  "01:42",
  "08:22",
  "04:17",
  "02:36",
  "06:51",
  "03:59",
];

const imageCounts = [
  "120 images",
  "85 images",
  "64 images",
  "210 images",
  "45 images",
  "132 images",
  "78 images",
  "90 images",
  "118 images",
  "74 images",
  "156 images",
  "102 images",
  "67 images",
  "188 images",
  "93 images",
  "141 images",
  "52 images",
  "176 images",
  "110 images",
  "69 images",
  "204 images",
  "98 images",
  "81 images",
  "147 images",
  "59 images",
  "225 images",
  "136 images",
  "72 images",
  "164 images",
  "104 images",
];

const performerStats = [
  ["Active", "Filmography 18", "Pictorials 42"],
  ["Retired", "Filmography 12", "Pictorials 28"],
  ["Active", "Filmography 24", "Pictorials 55"],
  ["Active", "Filmography 9", "Pictorials 21"],
  ["Retired", "Filmography 15", "Pictorials 33"],
  ["Active", "Filmography 31", "Pictorials 68"],
  ["Active", "Filmography 7", "Pictorials 17"],
  ["Retired", "Filmography 22", "Pictorials 46"],
  ["Active", "Filmography 14", "Pictorials 29"],
  ["Retired", "Filmography 27", "Pictorials 51"],
  ["Active", "Filmography 19", "Pictorials 38"],
  ["Active", "Filmography 33", "Pictorials 70"],
  ["Retired", "Filmography 11", "Pictorials 24"],
  ["Active", "Filmography 26", "Pictorials 49"],
  ["Active", "Filmography 8", "Pictorials 19"],
  ["Retired", "Filmography 21", "Pictorials 44"],
  ["Active", "Filmography 29", "Pictorials 63"],
  ["Active", "Filmography 16", "Pictorials 35"],
  ["Retired", "Filmography 25", "Pictorials 57"],
  ["Active", "Filmography 10", "Pictorials 22"],
  ["Active", "Filmography 36", "Pictorials 76"],
  ["Retired", "Filmography 13", "Pictorials 30"],
  ["Active", "Filmography 28", "Pictorials 61"],
  ["Active", "Filmography 17", "Pictorials 40"],
  ["Retired", "Filmography 23", "Pictorials 53"],
  ["Active", "Filmography 32", "Pictorials 69"],
  ["Active", "Filmography 20", "Pictorials 47"],
  ["Retired", "Filmography 6", "Pictorials 15"],
  ["Active", "Filmography 34", "Pictorials 72"],
  ["Retired", "Filmography 30", "Pictorials 66"],
];

export const collectionConfigs: Record<CollectionKind, CollectionConfig> = {
  videos: {
    kind: "videos",
    title: "Videos",
    subtitle: "Manage your local video catalog",
    countLabel: "30 videos",
    actionLabel: "Add Video",
    actionTo: "/videos/new",
    searchPlaceholder: "Search videos...",
    filterLabel: "Categories",
    filterOptions: ["All categories", "Category A", "Category B"],
    sortLabel: "Sort by",
    sortOptions: ["Title A-Z", "Title Z-A", "Last Added", "Last Updated"],
    placeholderLabel: "Cover Placeholder",
    items: videoDurations.map((duration, index) => ({
      kind: "videos",
      key: `video-sample-${String(index + 1).padStart(3, "0")}`,
      title: "Sample Video Title",
      originalTitle: "Original Title Placeholder",
      code: `VID-${String(index + 1).padStart(3, "0")}`,
      duration,
      durationMinutes: numberFromDisplayText(duration),
      releaseYear: 2026 - (index % 6),
      ratingBucket: (index % 5) + 1,
      quality: index % 5 === 0 ? "4K" : index % 3 === 0 ? "FHD" : "HD",
      availability: "Owned",
      censorship: "Censored",
      publisherLabel: index % 2 === 0 ? "Sample Publisher" : "Studio Sakura",
      categories,
      favorite: index === 0 || index === 2 || index === 5 || index === 9,
    })),
  },
  images: {
    kind: "images",
    title: "Images",
    subtitle: "Manage your local image catalog",
    countLabel: "30 images",
    actionLabel: "Add Image",
    actionTo: "/images/new",
    searchPlaceholder: "Search images...",
    filterLabel: "Categories",
    filterOptions: ["All categories", "Category A", "Category B"],
    sortLabel: "Sort by",
    sortOptions: ["Title A-Z", "Title Z-A", "Last Added", "Last Updated"],
    placeholderLabel: "Image Placeholder",
    items: imageCounts.map((imageCount, index) => ({
      kind: "images",
      key: `image-sample-${String(index + 1).padStart(3, "0")}`,
      title: "Sample Image Title",
      originalTitle: "Original Title Placeholder",
      code: `IMG-${String(index + 1).padStart(3, "0")}`,
      imageCount,
      imageCountValue: numberFromDisplayText(imageCount),
      releaseYear: 2026 - (index % 6),
      ratingBucket: (index % 5) + 1,
      quality: index % 5 === 0 ? "4K" : index % 3 === 0 ? "FHD" : "HD",
      availability: "Owned",
      censorship: "Censored",
      publisherLabel: index % 2 === 0 ? "Sample Publisher" : "Studio Sakura",
      categories,
      favorite: index === 0 || index === 2 || index === 5 || index === 7,
    })),
  },
  performers: {
    kind: "performers",
    title: "Performers",
    subtitle: "Manage your local performer catalog",
    countLabel: "30 performers",
    actionLabel: "Add Performer",
    actionTo: "/performers/new",
    searchPlaceholder: "Search performers...",
    filterLabel: "Categories",
    filterOptions: ["All categories", "Category A", "Category B"],
    sortLabel: "Sort by",
    sortOptions: ["Name A-Z", "Name Z-A", "Last Added", "Last Updated"],
    placeholderLabel: "Profile Placeholder",
    items: performerStats.map(([status, filmographyCount, pictorialsCount], index) => ({
      kind: "performers",
      key: `performer-sample-${String(index + 1).padStart(3, "0")}`,
      name: "Sample Performer Name",
      originalName: "Original Name Placeholder",
      aliases: "Alias One, Alias Two",
      yearsActive: "Unknown - Now",
      activeAges: "Age unknown",
      status,
      gender: "",
      birthDate: `19${90 + (index % 10)}-01-01`,
      nationality: index % 2 === 0 ? "Japan" : "Korea",
      heightCm: 152 + (index % 18),
      cupSize: ["A", "B", "C", "D"][index % 4],
      debutYear: 2010 + (index % 6),
      ratingBucket: (index % 5) + 1,
      filmographyCount,
      filmographyCountValue: numberFromDisplayText(filmographyCount),
      pictorialsCount,
      pictorialsCountValue: numberFromDisplayText(pictorialsCount),
      categories: [...categories, `Body Type: ${["Slim", "Average", "Curvy"][index % 3]}`],
      favorite: index === 0 || index === 2 || index === 5 || index === 7,
    })),
  },
};

function numberFromDisplayText(value: string) {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}
