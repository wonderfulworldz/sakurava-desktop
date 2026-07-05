export type FormKind = "videos" | "images" | "performers";

export type FormMode = "create" | "edit";

export type RelatedPerformerFormValue = {
  performerId: string;
  nameSnapshot: string;
};

export type RelatedCatalogRecordFormValue = {
  recordId: string;
  titleSnapshot: string;
};

export type SourceLinkFormValue = {
  title: string;
  url: string;
};

export type TextField = {
  name: string;
  label: string;
  type?: "text" | "date" | "number";
  required?: boolean;
  suffix?: string;
  helper?: string;
  placeholder?: string;
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
  techInputFields?: TextField[];
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
  initialRelatedPerformers?: Record<FormMode, RelatedPerformerFormValue[]>;
  initialRelatedCatalogRecords?: Record<
    FormMode,
    RelatedCatalogRecordFormValue[]
  >;
  initialPerformerRelatedVideos?: Record<FormMode, RelatedCatalogRecordFormValue[]>;
  initialPerformerRelatedImages?: Record<FormMode, RelatedCatalogRecordFormValue[]>;
  initialGalleryImagePaths?: Record<FormMode, string[]>;
  initialSourceLinks?: Record<FormMode, SourceLinkFormValue[]>;
};

const availabilityOptions = ["Owned", "Not Owned", "Missing"];
const censorshipOptions = ["Censored", "Uncensored", "Reduced / Reduced Mosaic", "Leaked", "Unknown"];

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
      { name: "title", label: "Title", required: true, placeholder: "Video title" },
      { name: "originalTitle", label: "Original Title", placeholder: "Original release title" },
      { name: "code", label: "Code", placeholder: "VID-001" },
    ],
    selectFields: [
      { name: "availability", label: "Availability", options: availabilityOptions },
      { name: "censorship", label: "Censorship", options: censorshipOptions },
    ],
    pathFields: [
      {
        name: "coverPath",
        label: "Cover Path",
        placeholder: "D:/Videos/title/cover.jpg",
      },
      {
        name: "mediaPath",
        label: "Media Path",
        placeholder: "D:/Videos/title/video.mp4",
      },
    ],
    metadataFields: [
      { name: "releaseDate", label: "Release Date", type: "date" },
      { name: "publisherLabel", label: "Publisher / Label", placeholder: "Studio or label" },
    ],
    techTitle: "Tech Info",
    techMessage: "Detect from the media path when available.",
    techInputFields: [
      {
        name: "durationMinutes",
        label: "Duration",
        type: "number",
        suffix: "minutes",
        placeholder: "n/a",
      },
      { name: "resolution", label: "Resolution", placeholder: "n/a" },
      { name: "fileSizeBytes", label: "File Size", type: "number", suffix: "bytes" },
      { name: "fileType", label: "File Type" },
    ],
    techFields: [],
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
        resolution: "",
        fileSizeBytes: "",
        fileType: "",
        publisherLabel: "",
        notes: "",
        rewatch: "1",
        performance: "1",
        visual: "1",
        intensity: "1",
        story: "1",
        chemistry: "1",
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
        resolution: "",
        fileSizeBytes: "",
        fileType: "",
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
    initialRelatedPerformers: {
      create: [],
      edit: [],
    },
    initialRelatedCatalogRecords: {
      create: [],
      edit: [],
    },
    initialGalleryImagePaths: {
      create: [],
      edit: [],
    },
    initialSourceLinks: {
      create: [],
      edit: [],
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
      { name: "title", label: "Title", required: true, placeholder: "Image set title" },
      { name: "originalTitle", label: "Original Title", placeholder: "Original image set title" },
      { name: "code", label: "Code", placeholder: "IMG-001" },
    ],
    selectFields: [
      { name: "availability", label: "Availability", options: availabilityOptions },
      { name: "censorship", label: "Censorship", options: censorshipOptions },
    ],
    pathFields: [
      {
        name: "coverPath",
        label: "Cover Path",
        placeholder: "D:/Images/set/cover.jpg",
      },
    ],
    metadataFields: [
      { name: "releaseDate", label: "Release Date", type: "date" },
      { name: "publisherLabel", label: "Publisher / Label", placeholder: "Studio or label" },
    ],
    techTitle: "Tech Info",
    techMessage: "Detect from Gallery Path when available.",
    techInputFields: [
      { name: "imageCount", label: "Image Count", type: "number" },
      { name: "mainResolution", label: "Main Resolution" },
      { name: "totalFileSizeBytes", label: "Total File Size", type: "number", suffix: "bytes" },
      { name: "mainFileType", label: "Main File Type" },
    ],
    techFields: [],
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
        mainResolution: "",
        totalFileSizeBytes: "",
        mainFileType: "",
        publisherLabel: "",
        notes: "",
        memorability: "1",
        visual: "1",
        posing: "1",
        atmosphere: "1",
        flow: "1",
        signature: "1",
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
        mainResolution: "",
        totalFileSizeBytes: "",
        mainFileType: "",
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
    initialRelatedPerformers: {
      create: [],
      edit: [],
    },
    initialRelatedCatalogRecords: {
      create: [],
      edit: [],
    },
    initialSourceLinks: {
      create: [],
      edit: [],
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
      { name: "name", label: "Name", required: true, placeholder: "Performer name" },
      { name: "originalName", label: "Original Name", placeholder: "Original performer name" },
    ],
    selectFields: [],
    pathFields: [
      {
        name: "coverPath",
        label: "Cover Path",
        placeholder: "D:/Performers/name/cover.jpg",
      },
    ],
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
        {
          name: "thumbnail1",
          label: "Thumbnail 1",
          placeholder: "D:/Performers/name/thumb-1.jpg",
        },
        {
          name: "thumbnail2",
          label: "Thumbnail 2",
          placeholder: "D:/Performers/name/thumb-2.jpg",
        },
        {
          name: "thumbnail3",
          label: "Thumbnail 3",
          placeholder: "D:/Performers/name/thumb-3.jpg",
        },
        {
          name: "thumbnail4",
          label: "Thumbnail 4",
          placeholder: "D:/Performers/name/thumb-4.jpg",
        },
      ],
      summary: [],
      personal: [
        { name: "gender", label: "Gender" },
        { name: "debutDate", label: "Debut Date", type: "date" },
        { name: "retiredDate", label: "Retired Date", type: "date" },
        { name: "birthDate", label: "Birth Date", type: "date" },
        { name: "birthplace", label: "Birthplace" },
        { name: "nationality", label: "Nationality" },
        { name: "astrologicalSign", label: "Astrological Sign" },
        { name: "bloodType", label: "Blood Type" },
      ],
      physical: [
        { name: "heightCm", label: "Height", type: "number", suffix: "cm" },
        { name: "weightKg", label: "Weight", type: "number", suffix: "kg" },
        { name: "measurements", label: "Measurements" },
        { name: "cupSize", label: "Cup Size" },
      ],
    },
    initialValues: {
      create: {
        name: "",
        originalName: "",
        favorite: false,
        gender: "",
        coverPath: "",
        thumbnail1: "",
        thumbnail2: "",
        thumbnail3: "",
        thumbnail4: "",
        debutDate: "",
        retiredDate: "",
        birthDate: "",
        birthplace: "",
        nationality: "",
        astrologicalSign: "",
        bloodType: "",
        heightCm: "",
        weightKg: "",
        measurements: "",
        cupSize: "",
        notes: "",
        attraction: "1",
        visual: "1",
        performance: "1",
        popularity: "1",
        exceptional: "1",
        versatility: "1",
      },
      edit: {
        name: "Sample Performer Name",
        originalName: "Original Name Placeholder",
        favorite: true,
        gender: "",
        coverPath: "D:/Images/Performers/sample_cover.jpg",
        thumbnail1: "",
        thumbnail2: "",
        thumbnail3: "",
        thumbnail4: "",
        debutDate: "",
        retiredDate: "",
        birthDate: "1998-01-01",
        birthplace: "",
        nationality: "",
        astrologicalSign: "",
        bloodType: "",
        heightCm: "",
        weightKg: "",
        measurements: "",
        cupSize: "",
        notes: "This is a sample note for the performer.",
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
    initialPerformerRelatedVideos: {
      create: [],
      edit: [],
    },
    initialPerformerRelatedImages: {
      create: [],
      edit: [],
    },
    initialSourceLinks: {
      create: [],
      edit: [],
    },
  },
};
