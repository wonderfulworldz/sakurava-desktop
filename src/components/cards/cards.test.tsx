import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { VideoCollectionItem, ImageCollectionItem, PerformerCollectionItem } from "../../lib/collectionData";
import type { HomeRecentItem } from "../../lib/homeData";
import { VideoFullCard } from "./VideoFullCard";
import { ImageFullCard } from "./ImageFullCard";
import { PerformerFullCard } from "./PerformerFullCard";
import { VideoLiteCard } from "./VideoLiteCard";
import { ImageLiteCard } from "./ImageLiteCard";
import { PerformerLiteCard } from "./PerformerLiteCard";
import { CategoryChips, CensorshipIcon, displayValue, normalizeCensorship, numericStatValue } from "./CardShared";

function wrap(ui: React.ReactElement) {
  return render(ui, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
}

const videoItem: VideoCollectionItem = {
  kind: "videos",
  key: "v1",
  title: "Test Video Title",
  originalTitle: "Original Video",
  code: "VID-001",
  coverPath: "",
  favorite: true,
  duration: "240",
  durationMinutes: 240,
  releaseYear: 2026,
  ratingAverage: 4.5,
  ratingBucket: 4,
  quality: "FHD",
  availability: "Owned",
  censorship: "Censored",
  categories: ["Action", "Drama", "Sci-Fi", "Horror", "Comedy", "Thriller", "Romance", "Fantasy", "Adventure"],
};

const imageItem: ImageCollectionItem = {
  kind: "images",
  key: "i1",
  title: "Test Image Title",
  originalTitle: "Original Image",
  code: "IMG-001",
  coverPath: "",
  favorite: false,
  imageCount: "1,240",
  imageCountValue: 1240,
  releaseYear: 2025,
  ratingAverage: 3.8,
  ratingBucket: 3,
  quality: "4K",
  availability: "Owned",
  censorship: "Uncensored",
  categories: ["Cosplay", "Blonde", "Studio", "Outdoor", "Portrait", "Fashion", "Editorial"],
};

const performerItem: PerformerCollectionItem = {
  kind: "performers",
  key: "p1",
  name: "Test Performer",
  originalName: "テストパフォーマー",
  aliases: "Alias One, Alias Two",
  yearsActive: "2020 - Now",
  activeAges: "Age 22-28",
  coverPath: "",
  favorite: true,
  status: "Active",
  ratingAverage: 4.0,
  ratingBucket: 4,
  filmographyCount: "Filmography 128",
  filmographyCountValue: 128,
  pictorialsCount: "Pictorials 24",
  pictorialsCountValue: 24,
  categories: ["Cosplay", "Blonde", "Petite", "Japanese", "Idol", "Gravure", "Model", "Actress"],
};

describe("displayValue fallback", () => {
  it("null renders n/a", () => {
    expect(displayValue(null)).toBe("n/a");
  });

  it("undefined renders n/a", () => {
    expect(displayValue(undefined)).toBe("n/a");
  });

  it("empty string renders n/a", () => {
    expect(displayValue("")).toBe("n/a");
  });

  it("dash renders n/a", () => {
    expect(displayValue("-")).toBe("n/a");
  });

  it("zero metric renders n/a", () => {
    expect(displayValue(0)).toBe("n/a");
    expect(displayValue("0")).toBe("n/a");
  });

  it("Not detected yet renders n/a", () => {
    expect(displayValue("Not detected yet")).toBe("n/a");
    expect(displayValue("not detected yet")).toBe("n/a");
  });

  it("valid non-zero values render correctly", () => {
    expect(displayValue("240")).toBe("240");
    expect(displayValue(128)).toBe("128");
    expect(displayValue("FHD")).toBe("FHD");
    expect(displayValue("VID-001")).toBe("VID-001");
  });
});

describe("VideoFullCard", () => {
  it("renders all required fields", () => {
    wrap(<VideoFullCard item={videoItem} linkTo="/videos/v1" />);

    expect(screen.getByText("Test Video Title")).toBeInTheDocument();
    expect(screen.getByText("VID-001")).toBeInTheDocument();
    expect(screen.getByLabelText("Rating 4.5")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByText("240")).toBeInTheDocument();
    expect(screen.getByText("Minutes")).toBeInTheDocument();
    expect(screen.getByText("FHD")).toBeInTheDocument();
  });

  it("uses average rating for the full-card badge and never shows fake zero", () => {
    wrap(
      <VideoFullCard
        item={{ ...videoItem, ratingAverage: null, ratingBucket: null }}
        linkTo="/videos/v1"
      />,
    );

    expect(screen.getByLabelText("Rating n/a")).toBeInTheDocument();
    expect(screen.queryByLabelText("Rating 0.0")).not.toBeInTheDocument();
  });

  it("duration stat value is number only, no 'min' inside value", () => {
    wrap(<VideoFullCard item={videoItem} linkTo="/videos/v1" />);
    expect(screen.getByText("240")).toBeInTheDocument();
    expect(screen.queryByText("240 min")).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ min/)).not.toBeInTheDocument();
  });

  it("duration stat label renders 'Minutes'", () => {
    wrap(<VideoFullCard item={videoItem} linkTo="/videos/v1" />);
    expect(screen.getByText("Minutes")).toBeInTheDocument();
  });

  it("uses 16:9 thumbnail ratio", () => {
    const { container } = wrap(<VideoFullCard item={videoItem} linkTo="/videos/v1" />);
    expect(container.querySelector(".aspect-video")).not.toBeNull();
  });

  it("uses grid-cols-4 stat layout (1/2 + 1/4 + 1/4)", () => {
    const { container } = wrap(<VideoFullCard item={videoItem} linkTo="/videos/v1" />);
    expect(container.querySelector(".grid-cols-4")).not.toBeNull();
    expect(container.querySelector(".col-span-2")).not.toBeNull();
  });

  it("renders category footer with maxVisible=4 and +N overflow", () => {
    wrap(<VideoFullCard item={videoItem} linkTo="/videos/v1" />);

    // 9 categories, max 4 visible = 4 chips + "+5"
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Drama")).toBeInTheDocument();
    expect(screen.getByText("Sci-Fi")).toBeInTheDocument();
    expect(screen.getByText("Horror")).toBeInTheDocument();
    expect(screen.queryByText("Comedy")).not.toBeInTheDocument();
    expect(screen.getByText("+5")).toBeInTheDocument();
  });

  it("shows n/a for empty duration", () => {
    wrap(<VideoFullCard item={{ ...videoItem, durationMinutes: null }} linkTo="/videos/v1" />);
    expect(screen.getAllByText("n/a").length).toBeGreaterThan(0);
  });
});

describe("ImageFullCard", () => {
  it("renders category footer with maxVisible=4 and +N overflow", () => {
    wrap(<ImageFullCard item={imageItem} linkTo="/images/i1" />);

    // 7 categories, max 4 visible = 4 chips + "+3"
    expect(screen.getByText("Cosplay")).toBeInTheDocument();
    expect(screen.getByText("Blonde")).toBeInTheDocument();
    expect(screen.getByText("Studio")).toBeInTheDocument();
    expect(screen.getByText("Outdoor")).toBeInTheDocument();
    expect(screen.queryByText("Portrait")).not.toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("image count stat value is number only, no 'images' inside value", () => {
    wrap(<ImageFullCard item={imageItem} linkTo="/images/i1" />);
    expect(screen.getByText("1240")).toBeInTheDocument();
    expect(screen.queryByText("1,240 images")).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ images/)).not.toBeInTheDocument();
  });

  it("image count stat label renders 'Pictures'", () => {
    wrap(<ImageFullCard item={imageItem} linkTo="/images/i1" />);
    expect(screen.getByText("Pictures")).toBeInTheDocument();
  });
});

describe("PerformerFullCard", () => {
  it("renders category footer with maxVisible=5 and +N overflow", () => {
    wrap(<PerformerFullCard item={performerItem} linkTo="/performers/p1" />);

    // 8 categories, max 5 visible = 5 chips + "+3"
    expect(screen.getByText("Cosplay")).toBeInTheDocument();
    expect(screen.getByText("Blonde")).toBeInTheDocument();
    expect(screen.getByText("Petite")).toBeInTheDocument();
    expect(screen.getByText("Japanese")).toBeInTheDocument();
    expect(screen.getByText("Idol")).toBeInTheDocument();
    expect(screen.queryByText("Gravure")).not.toBeInTheDocument();
    expect(screen.queryByText("Model")).not.toBeInTheDocument();
    expect(screen.queryByText("Actress")).not.toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("renders all categories when count is at or below cap", () => {
    const item = { ...performerItem, categories: ["Slim", "Blonde", "Blue Eye", "Petite"] };
    wrap(<PerformerFullCard item={item} linkTo="/performers/p1" />);

    expect(screen.getByText("Slim")).toBeInTheDocument();
    expect(screen.getByText("Blonde")).toBeInTheDocument();
    expect(screen.getByText("Blue Eye")).toBeInTheDocument();
    expect(screen.getByText("Petite")).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it("renders name, rating, years active, filmography, pictorials", () => {
    wrap(<PerformerFullCard item={performerItem} linkTo="/performers/p1" />);

    expect(screen.getByText("Test Performer")).toBeInTheDocument();
    expect(screen.getByText("テストパフォーマー")).toBeInTheDocument();
    expect(screen.getByLabelText("Rating 4.0")).toBeInTheDocument();
    expect(screen.getByText("2020 - Now")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("Filmography")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("Pictorials")).toBeInTheDocument();
  });

  it("uses shared CategoryChips component with nowrap", () => {
    const { container } = wrap(<PerformerFullCard item={performerItem} linkTo="/performers/p1" />);
    expect(container.querySelector('[class*="flex-nowrap"]')).not.toBeNull();
  });
});

describe("Lite cards - primary stat labels", () => {
  const videoLiteItem: HomeRecentItem = {
    kind: "videos",
    key: "v1",
    title: "Lite Video",
    detail: "VID-001",
    typeLabel: "Video",
    coverPath: "",
    favorite: true,
    duration: "24",
    rating: 4.2,
    quality: "HD",
    censorship: "Censored",
  };

  const imageLiteItem: HomeRecentItem = {
    kind: "images",
    key: "i1",
    title: "Lite Image",
    detail: "IMG-001",
    typeLabel: "Image",
    coverPath: "",
    favorite: false,
    imageCount: "6",
    rating: 3.5,
    quality: "FHD",
    censorship: "Uncensored",
  };

  const performerLiteItem: HomeRecentItem = {
    kind: "performers",
    key: "p1",
    title: "Lite Performer",
    detail: "Original Name",
    typeLabel: "Performer",
    coverPath: "",
    favorite: true,
    filmographyCount: "42",
    pictorialsCount: "18",
    rating: 4.8,
  };

  it("VideoLiteCard renders value and 'minutes' label (not 'min')", () => {
    wrap(<VideoLiteCard item={videoLiteItem} linkTo="/videos/v1" />);

    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("minutes")).toBeInTheDocument();
    expect(screen.queryByText("min")).not.toBeInTheDocument();
  });

  it("ImageLiteCard renders value and 'images' label", () => {
    wrap(<ImageLiteCard item={imageLiteItem} linkTo="/images/i1" />);

    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("images")).toBeInTheDocument();
  });

  it("PerformerLiteCard renders Filmography and Pictorials labels", () => {
    wrap(<PerformerLiteCard item={performerLiteItem} linkTo="/performers/p1" />);

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Filmography")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("Pictorials")).toBeInTheDocument();
  });

  it("Lite cards do not render category footer", () => {
    const { container: vc } = wrap(<VideoLiteCard item={videoLiteItem} linkTo="/videos/v1" />);
    const { container: ic } = wrap(<ImageLiteCard item={imageLiteItem} linkTo="/images/i1" />);
    const { container: pc } = wrap(<PerformerLiteCard item={performerLiteItem} linkTo="/performers/p1" />);

    // CategoryChips renders a flex-nowrap container - Lite cards should not have one
    expect(vc.querySelector('[class*="flex-nowrap"]')).toBeNull();
    expect(ic.querySelector('[class*="flex-nowrap"]')).toBeNull();
    expect(pc.querySelector('[class*="flex-nowrap"]')).toBeNull();
  });

  it("Lite cards have consistent h-full structure", () => {
    const { container: vc } = wrap(<VideoLiteCard item={videoLiteItem} linkTo="/videos/v1" />);
    const { container: ic } = wrap(<ImageLiteCard item={imageLiteItem} linkTo="/images/i1" />);
    const { container: pc } = wrap(<PerformerLiteCard item={performerLiteItem} linkTo="/performers/p1" />);

    expect(vc.querySelector(".h-full")).not.toBeNull();
    expect(ic.querySelector(".h-full")).not.toBeNull();
    expect(pc.querySelector(".h-full")).not.toBeNull();
  });

  it("empty duration shows n/a in Lite card", () => {
    wrap(<VideoLiteCard item={{ ...videoLiteItem, duration: "" }} linkTo="/videos/v1" />);
    expect(screen.getAllByText("n/a").length).toBeGreaterThan(0);
  });
});

describe("Censorship display", () => {
  it("normalizeCensorship supports all statuses", () => {
    expect(normalizeCensorship("Censored")).toBe("Censored");
    expect(normalizeCensorship("censored")).toBe("Censored");
    expect(normalizeCensorship("Uncensored")).toBe("Uncensored");
    expect(normalizeCensorship("Reduced")).toBe("Reduced");
    expect(normalizeCensorship("Reduced Mosaic")).toBe("Reduced");
    expect(normalizeCensorship("reduced mosaic")).toBe("Reduced");
    expect(normalizeCensorship("Leaked")).toBe("Leaked");
    expect(normalizeCensorship("leaked")).toBe("Leaked");
    expect(normalizeCensorship("")).toBe("Unknown");
    expect(normalizeCensorship(undefined)).toBe("Unknown");
    expect(normalizeCensorship(null)).toBe("Unknown");
  });

  it("CensorshipIcon renders all statuses", () => {
    const { unmount: u1 } = wrap(<CensorshipIcon status="Censored" />);
    expect(screen.getByLabelText("Censored")).toBeInTheDocument();
    u1();

    const { unmount: u2 } = wrap(<CensorshipIcon status="Uncensored" />);
    expect(screen.getByLabelText("Uncensored")).toBeInTheDocument();
    u2();

    const { unmount: u3 } = wrap(<CensorshipIcon status="Reduced" />);
    expect(screen.getByLabelText("Reduced")).toBeInTheDocument();
    u3();

    const { unmount: u4 } = wrap(<CensorshipIcon status="Leaked" />);
    expect(screen.getByLabelText("Leaked")).toBeInTheDocument();
    u4();

    wrap(<CensorshipIcon status="Unknown" />);
    expect(screen.getByLabelText("Unknown censorship")).toBeInTheDocument();
  });

  it("empty censorship becomes Unknown in card", () => {
    const item: VideoCollectionItem = { ...videoItem, censorship: "" };
    wrap(<VideoFullCard item={item} linkTo="/videos/v1" />);
    expect(screen.getByLabelText("Unknown censorship")).toBeInTheDocument();
  });
});

describe("CategoryChips", () => {
  it("is not hard-limited to 3", () => {
    wrap(<CategoryChips categories={["A", "B", "C", "D", "E"]} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.getByText("E")).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it("shows +N overflow when maxVisible is set", () => {
    wrap(<CategoryChips categories={["A", "B", "C", "D", "E"]} maxVisible={3} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.queryByText("D")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders nothing when no valid categories", () => {
    const { container } = wrap(<CategoryChips categories={["-", "No category"]} />);
    expect(container.innerHTML).toBe("");
  });

  it("uses nowrap single-line layout", () => {
    const { container } = wrap(<CategoryChips categories={["A", "B", "C"]} />);
    const rows = container.querySelectorAll('[class*="flex-nowrap"]');
    expect(rows.length).toBeGreaterThan(0);
    // Inner container has overflow-hidden
    expect(container.querySelector('[class*="overflow-hidden"]')).not.toBeNull();
  });
});

describe("Favorite button", () => {
  it("calls onFavoriteClick when clicked", () => {
    const onFavoriteClick = vi.fn();
    wrap(<VideoFullCard item={videoItem} linkTo="/videos/v1" onFavoriteClick={onFavoriteClick} />);

    fireEvent.click(screen.getByLabelText("Favorite"));
    expect(onFavoriteClick).toHaveBeenCalledTimes(1);
  });

  it("Lite card calls onFavoriteClick when clicked", () => {
    const onFavoriteClick = vi.fn();
    const item: HomeRecentItem = {
      kind: "videos", key: "v1", title: "T", detail: "", typeLabel: "Video",
      coverPath: "", favorite: true, rating: null,
    };
    wrap(<VideoLiteCard item={item} linkTo="/videos/v1" onFavoriteClick={onFavoriteClick} />);

    fireEvent.click(screen.getByLabelText("Favorite"));
    expect(onFavoriteClick).toHaveBeenCalledTimes(1);
  });

  it("click calls stopPropagation and preventDefault", () => {
    wrap(<VideoFullCard item={videoItem} linkTo="/videos/v1" />);
    const favoriteButton = screen.getByLabelText("Favorite");

    expect(favoriteButton.tagName).toBe("BUTTON");
    expect(favoriteButton.getAttribute("type")).toBe("button");

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    const stopPropagationSpy = vi.spyOn(event, "stopPropagation");
    favoriteButton.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it("renders active state (Favorite label)", () => {
    wrap(<VideoFullCard item={{ ...videoItem, favorite: true }} linkTo="/videos/v1" />);
    expect(screen.getByLabelText("Favorite")).toBeInTheDocument();
  });

  it("renders inactive state (Not favorite label)", () => {
    wrap(<VideoFullCard item={{ ...videoItem, favorite: false }} linkTo="/videos/v1" />);
    expect(screen.getByLabelText("Not favorite")).toBeInTheDocument();
  });
});

describe("Missing thumbnail fallback", () => {
  it("shows placeholder when coverPath is empty", () => {
    wrap(<VideoFullCard item={{ ...videoItem, coverPath: "" }} linkTo="/videos/v1" placeholderLabel="Cover Placeholder" />);
    expect(screen.getByRole("img", { name: "Cover Placeholder" })).toBeInTheDocument();
  });
});

describe("numericStatValue", () => {
  it("extracts number from '24 min'", () => {
    expect(numericStatValue("24 min")).toBe("24");
  });

  it("extracts number from '6 images'", () => {
    expect(numericStatValue("6 images")).toBe("6");
  });

  it("extracts number from '1,240 images'", () => {
    expect(numericStatValue("1,240 images")).toBe("1,240");
  });

  it("passes through plain numbers", () => {
    expect(numericStatValue("128")).toBe("128");
    expect(numericStatValue(42)).toBe("42");
  });

  it("returns n/a for empty/null/zero", () => {
    expect(numericStatValue(null)).toBe("n/a");
    expect(numericStatValue(undefined)).toBe("n/a");
    expect(numericStatValue("")).toBe("n/a");
    expect(numericStatValue("-")).toBe("n/a");
    expect(numericStatValue(0)).toBe("n/a");
    expect(numericStatValue("Not detected yet")).toBe("n/a");
  });
});

describe("Lite stat normalization (no double labels)", () => {
  it("Video Lite with '24 min' shows '24' not '24 min'", () => {
    const item: HomeRecentItem = {
      kind: "videos", key: "v1", title: "Test", detail: "", typeLabel: "Video",
      coverPath: "", favorite: false, duration: "24 min", rating: null, quality: "HD",
    };
    wrap(<VideoLiteCard item={item} linkTo="/videos/v1" />);

    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("minutes")).toBeInTheDocument();
    expect(screen.queryByText("24 min")).not.toBeInTheDocument();
  });

  it("Image Lite with '6 images' shows '6' not '6 images'", () => {
    const item: HomeRecentItem = {
      kind: "images", key: "i1", title: "Test", detail: "", typeLabel: "Image",
      coverPath: "", favorite: false, imageCount: "6 images", rating: null, quality: "FHD",
    };
    wrap(<ImageLiteCard item={item} linkTo="/images/i1" />);

    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("images")).toBeInTheDocument();
    expect(screen.queryByText("6 images")).not.toBeInTheDocument();
  });

  it("Video Lite with empty duration shows n/a", () => {
    const item: HomeRecentItem = {
      kind: "videos", key: "v1", title: "Test", detail: "", typeLabel: "Video",
      coverPath: "", favorite: false, duration: "", rating: null,
    };
    wrap(<VideoLiteCard item={item} linkTo="/videos/v1" />);

    expect(screen.getAllByText("n/a").length).toBeGreaterThan(0);
    expect(screen.getByText("minutes")).toBeInTheDocument();
  });
});
