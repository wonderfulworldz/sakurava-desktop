export type FormKind = "videos" | "images" | "performers";

export type FormMode = "create" | "edit";

export type TextField = {
  name: string;
  label: string;
  type?: "text" | "date" | "number";
  required?: boolean;
  suffix?: string;
};

export type SelectField = {
  name: string;
  label: string;
  options: string[];
};

export type ReadOnlyField = {
  label: string;
  value: string;
};

export type RatingField = {
  name: string;
  label: string;
};

export type FormConfig = {
  kind: FormKind;
  createTitle: string;
  editTitle: string;
  createSubtitle: string;
  editSubtitle: string;
  createLabel: string;
  editLabel: string;
  createCancelTo: string;
  editCancelTo: string;
  editBackLabel: string;
  requiredField: string;
  basicFields: TextField[];
  selectFields: SelectField[];
  pathFields: TextField[];
  metadataFields: TextField[];
  techTitle?: string;
  techMessage?: string;
  techFields: ReadOnlyField[];
  ratingFields: RatingField[];
  relatedSections: ReadOnlyField[];
  showAliases?: boolean;
  performerSections?: {
    media: TextField[];
    summary: TextField[];
    personal: TextField[];
    physical: TextField[];
  };
  initialValues: Record<FormMode, Record<string, string | boolean>>;
  initialCategories: Record<FormMode, string[]>;
  initialAliases?: Record<FormMode, string[]>;
};

const availabilityOptions = ["Owned", "Not Owned", "Missing"];
const censorshipOptions = ["Censored", "Uncensored", "Reduced"];

export const formConfigs: Record<FormKind, FormConfig> = {
  videos: {
    kind: "videos",
    createTitle: "Add Video",
    editTitle: "Edit Video",
    createSubtitle: "Create a new video catalog item",
    editSubtitle: "Update a local video catalog item",
    createLabel: "Video Create Form",
    editLabel: "Video Edit Form",
    createCancelTo: "/videos",
    editCancelTo: "/videos/sample-id",
    editBackLabel: "Back to Video Detail",
    requiredField: "title",
    basicFields: [
      { name: "title", label: "Title", required: true },
      { name: "originalTitle", label: "Original Title" },
      { name: "code", label: "Code" },
    ],
    selectFields: [
      { name: "availability", label: "Availability", options: availabilityOptions },
      { name: "censorship", label: "Censorship", options: censorshipOptions },
    ],
    pathFields: [
      { name: "coverPath", label: "Cover Path" },
      { name: "mediaPath", label: "Media Path" },
    ],
    metadataFields: [
      { name: "releaseDate", label: "Release Date", type: "date" },
      { name: "durationMinutes", label: "Duration", type: "number", suffix: "minutes" },
      { name: "publisherLabel", label: "Publisher / Label" },
    ],
    techTitle: "Tech Info",
    techMessage: "Tech info is not detected in MVP.",
    techFields: [
      { label: "Resolution", value: "Not detected" },
      { label: "File Size", value: "Not detected" },
      { label: "Codec", value: "Not detected" },
      { label: "Bitrate", value: "Not detected" },
      { label: "Frame Rate", value: "Not detected" },
    ],
    ratingFields: [
      { name: "rewatch", label: "Rewatch" },
      { name: "performance", label: "Performance" },
      { name: "visual", label: "Visual" },
      { name: "intensity", label: "Intensity" },
      { name: "story", label: "Story" },
      { name: "chemistry", label: "Chemistry" },
    ],
    relatedSections: [
      { label: "Related Performer", value: "Available after relation features are added." },
      { label: "Related Images", value: "Available after relation features are added." },
    ],
    initialValues: {
      create: {
        title: "",
        originalTitle: "",
        code: "",
        favorite: false,
        availability: "Owned",
        censorship: "Censored",
        coverPath: "",
        mediaPath: "",
        releaseDate: "",
        durationMinutes: "",
        publisherLabel: "",
        notes: "",
        rewatch: "3",
        performance: "3",
        visual: "3",
        intensity: "3",
        story: "3",
        chemistry: "3",
      },
      edit: {
        title: "Sample Video Title",
        originalTitle: "Original Title Placeholder",
        code: "CODE-001",
        favorite: true,
        availability: "Owned",
        censorship: "Censored",
        coverPath: "D:/Videos/Sample Video/cover.jpg",
        mediaPath: "D:/Videos/Sample Video/sample.mp4",
        releaseDate: "2024-05-15",
        durationMinutes: "120",
        publisherLabel: "Sample Publisher",
        notes: "This is a sample note for the video.",
        rewatch: "4",
        performance: "4",
        visual: "5",
        intensity: "4",
        story: "3",
        chemistry: "4",
      },
    },
    initialCategories: {
      create: [],
      edit: ["Category A", "Category B"],
    },
  },
  images: {
    kind: "images",
    createTitle: "Add Image",
    editTitle: "Edit Image",
    createSubtitle: "Create a new image catalog item",
    editSubtitle: "Update a local image catalog item",
    createLabel: "Image Create Form",
    editLabel: "Image Edit Form",
    createCancelTo: "/images",
    editCancelTo: "/images/sample-id",
    editBackLabel: "Back to Image Detail",
    requiredField: "title",
    basicFields: [
      { name: "title", label: "Title", required: true },
      { name: "originalTitle", label: "Original Title" },
      { name: "code", label: "Code" },
    ],
    selectFields: [
      { name: "availability", label: "Availability", options: availabilityOptions },
      { name: "censorship", label: "Censorship", options: censorshipOptions },
    ],
    pathFields: [
      { name: "coverPath", label: "Cover Path" },
      { name: "folderPath", label: "Gallery Folder / Gallery Source" },
    ],
    metadataFields: [
      { name: "releaseDate", label: "Release Date", type: "date" },
      { name: "imageCount", label: "Image Count", type: "number" },
      { name: "publisherLabel", label: "Publisher / Label" },
    ],
    techTitle: "Tech Info",
    techMessage: "Folder analysis is not available in MVP.",
    techFields: [
      { label: "Folder Size", value: "Not detected" },
      { label: "Detected Image Count", value: "Not detected" },
      { label: "Main Resolution", value: "Not detected" },
      { label: "File Types", value: "Not detected" },
    ],
    ratingFields: [
      { name: "memorability", label: "Memorability" },
      { name: "visual", label: "Visual" },
      { name: "posing", label: "Posing" },
      { name: "atmosphere", label: "Atmosphere" },
      { name: "flow", label: "Flow" },
      { name: "signature", label: "Signature" },
    ],
    relatedSections: [
      { label: "Related Performer", value: "Available after relation features are added." },
      { label: "Related Video", value: "Available after relation features are added." },
    ],
    initialValues: {
      create: {
        title: "",
        originalTitle: "",
        code: "",
        favorite: false,
        availability: "Owned",
        censorship: "Censored",
        coverPath: "",
        folderPath: "",
        releaseDate: "",
        imageCount: "",
        publisherLabel: "",
        notes: "",
        memorability: "3",
        visual: "3",
        posing: "3",
        atmosphere: "3",
        flow: "3",
        signature: "3",
      },
      edit: {
        title: "Sample Image Title",
        originalTitle: "Original Title Placeholder",
        code: "CODE-001",
        favorite: true,
        availability: "Owned",
        censorship: "Censored",
        coverPath: "D:/Images/Sample Set/cover.jpg",
        folderPath: "D:/Images/Sample Set/",
        releaseDate: "2024-03-15",
        imageCount: "128",
        publisherLabel: "Sample Publisher",
        notes: "This is a sample notes section.",
        memorability: "4",
        visual: "5",
        posing: "4",
        atmosphere: "3",
        flow: "4",
        signature: "3",
      },
    },
    initialCategories: {
      create: [],
      edit: ["Category A", "Category B"],
    },
  },
  performers: {
    kind: "performers",
    createTitle: "Add Performer",
    editTitle: "Edit Performer",
    createSubtitle: "Create a new performer profile",
    editSubtitle: "Update a local performer profile",
    createLabel: "Performer Create Form",
    editLabel: "Performer Edit Form",
    createCancelTo: "/performers",
    editCancelTo: "/performers/sample-id",
    editBackLabel: "Back to Performer Detail",
    requiredField: "name",
    basicFields: [
      { name: "name", label: "Name", required: true },
      { name: "originalName", label: "Original Name" },
    ],
    selectFields: [
      { name: "status", label: "Status", options: ["Unknown", "Active", "Retired"] },
    ],
    pathFields: [{ name: "coverPath", label: "Cover Path" }],
    metadataFields: [],
    techFields: [],
    ratingFields: [
      { name: "attraction", label: "Attraction" },
      { name: "visual", label: "Visual" },
      { name: "performance", label: "Performance" },
      { name: "popularity", label: "Popularity" },
      { name: "exceptional", label: "Exceptional" },
      { name: "versatility", label: "Versatility" },
    ],
    relatedSections: [
      { label: "Related Videos", value: "Available after relation features are added." },
      { label: "Related Images", value: "Available after relation features are added." },
    ],
    showAliases: true,
    performerSections: {
      media: [
        { name: "thumbnail1", label: "Thumbnail 1" },
        { name: "thumbnail2", label: "Thumbnail 2" },
        { name: "thumbnail3", label: "Thumbnail 3" },
        { name: "thumbnail4", label: "Thumbnail 4" },
      ],
      summary: [
        { name: "yearsActive", label: "Years Active" },
        { name: "filmography", label: "Filmography", type: "number" },
        { name: "pictorials", label: "Pictorials", type: "number" },
      ],
      personal: [
        { name: "birthDate", label: "Birth Date", type: "date" },
        { name: "birthplace", label: "Birthplace" },
        { name: "nationality", label: "Nationality" },
        { name: "astrologicalSign", label: "Astrological Sign" },
        { name: "bloodType", label: "Blood Type" },
      ],
      physical: [
        { name: "height", label: "Height" },
        { name: "weight", label: "Weight" },
        { name: "measurement", label: "Measurement" },
        { name: "cupSize", label: "Cup Size" },
      ],
    },
    initialValues: {
      create: {
        name: "",
        originalName: "",
        favorite: false,
        status: "Active",
        coverPath: "",
        thumbnail1: "",
        thumbnail2: "",
        thumbnail3: "",
        thumbnail4: "",
        yearsActive: "Placeholder only",
        filmography: "0",
        pictorials: "0",
        birthDate: "",
        birthplace: "Inactive placeholder",
        nationality: "Inactive placeholder",
        astrologicalSign: "Inactive placeholder",
        bloodType: "Inactive placeholder",
        height: "Inactive placeholder",
        weight: "Inactive placeholder",
        measurement: "Inactive placeholder",
        cupSize: "Inactive placeholder",
        notes: "",
        attraction: "3",
        visual: "3",
        performance: "3",
        popularity: "3",
        exceptional: "3",
        versatility: "3",
      },
      edit: {
        name: "Sample Performer Name",
        originalName: "Original Name Placeholder",
        favorite: true,
        status: "Active",
        coverPath: "D:/Images/Performers/sample_cover.jpg",
        thumbnail1: "D:/Images/Performers/thumb1.jpg",
        thumbnail2: "D:/Images/Performers/thumb2.jpg",
        thumbnail3: "D:/Images/Performers/thumb3.jpg",
        thumbnail4: "D:/Images/Performers/thumb4.jpg",
        yearsActive: "2015 - present",
        filmography: "30",
        pictorials: "25",
        birthDate: "1998-01-01",
        birthplace: "Tokyo, Japan",
        nationality: "Japanese",
        astrologicalSign: "Capricorn",
        bloodType: "O",
        height: "165 cm",
        weight: "50 kg",
        measurement: "88-58-85 cm",
        cupSize: "C",
        notes: "This is a read-only placeholder for personal notes about the performer.",
        attraction: "4",
        visual: "4",
        performance: "4",
        popularity: "4",
        exceptional: "4",
        versatility: "3",
      },
    },
    initialCategories: {
      create: [],
      edit: ["Category A", "Category B"],
    },
    initialAliases: {
      create: [],
      edit: ["Alias A", "Alias B"],
    },
  },
};
