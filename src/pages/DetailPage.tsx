import {
  ArrowLeft,
  Calendar,
  Clapperboard,
  Edit3,
  FileImage,
  Film,
  Folder,
  Heart,
  Image as ImageIcon,
  Info,
  Ruler,
  Star,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { DetailConfig, PerformerDetailConfig } from "../lib/detailData";

type DetailPageProps = {
  config: DetailConfig;
};

function DetailPage({ config }: DetailPageProps) {
  if (config.kind === "performers") {
    return <PerformerDetailPage config={config} />;
  }

  return <CatalogDetailPage config={config} />;
}

function DetailHeader({ config }: DetailPageProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Link
          to={config.backTo}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600"
        >
          <ArrowLeft size={16} />
          {config.backLabel}
        </Link>
        <Link
          to={config.editTo}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sakura-500 px-5 text-sm font-semibold text-white shadow-sm shadow-sakura-200 transition hover:bg-sakura-600"
        >
          <Edit3 size={16} />
          Edit
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          {config.title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {config.subtitle}
        </p>
      </div>
    </div>
  );
}

function CatalogDetailPage({ config }: DetailPageProps) {
  return (
    <div className="space-y-5">
      <DetailHeader config={config} />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-6 lg:grid-cols-[minmax(360px,0.9fr)_1.1fr]">
          <LargePlaceholder config={config} />
          <CatalogIdentity config={config} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.3fr_0.85fr]">
        <RowsCard title="Metadata" icon={Calendar} items={config.metadata} />
        <RatingSummaryCard title={config.ratingTitle} rating={config.rating} />
        <RowsCard
          title={config.techTitle}
          icon={Info}
          items={config.techItems}
          message={config.techMessage}
          readOnly
        />
      </section>

      <NotesCard notes={config.notes} />
      <RelatedRows sections={config.relatedSections} />

      {config.kind === "images" && <GalleryGrid labels={config.galleryLabels} />}
    </div>
  );
}

function CatalogIdentity({ config }: DetailPageProps) {
  return (
    <div className="flex min-h-full flex-col justify-center py-2">
      <h2 className="text-2xl font-semibold tracking-normal text-slate-950">
        {config.displayTitle}
      </h2>
      <p className="mt-2 text-base text-slate-500">{config.originalTitle}</p>

      {"code" in config && (
        <div className="mt-4">
          <Chip label={config.code} tone="neutral" />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <Chip label="Favorite" icon={Heart} tone="pink" />
        {config.chips.map((chip) => (
          <Chip
            key={chip}
            label={chip}
            tone={chip === "Owned" || chip === "Active" ? "green" : "orange"}
          />
        ))}
      </div>

      <div className="mt-6 border-t border-slate-100 pt-4">
        <p className="text-sm font-semibold text-slate-800">Categories:</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {config.categories.map((category) => (
            <Chip key={category} label={category} tone="pinkSoft" />
          ))}
        </div>
      </div>
    </div>
  );
}

function PerformerDetailPage({ config }: { config: PerformerDetailConfig }) {
  return (
    <div className="space-y-5">
      <DetailHeader config={config} />

      <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <PerformerProfileCard config={config} />

        <div className="space-y-5">
          <PerformerSummaryCards config={config} />
          <RatingSummaryCard title={config.ratingTitle} rating={config.rating} />
          <section className="grid gap-5 lg:grid-cols-2">
            <RowsCard title="Personal" icon={UserRound} items={config.personal} />
            <RowsCard title="Physical" icon={Ruler} items={config.physical} />
          </section>
          <NotesCard notes={config.notes} />
        </div>
      </div>

      <RelatedRows sections={config.relatedSections} />
    </div>
  );
}

function PerformerProfileCard({ config }: { config: PerformerDetailConfig }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <LargePlaceholder config={config} />

      <div className="mt-4 grid grid-cols-4 gap-3">
        {config.techItems.map((item) => (
          <SmallThumbnail key={item.label} label={item.label} />
        ))}
      </div>

      <div className="mt-5">
        <h2 className="text-2xl font-semibold tracking-normal text-slate-950">
          {config.displayTitle}
        </h2>
        <p className="mt-2 text-sm text-slate-500">{config.originalTitle}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip label="Active" tone="green" />
        <Chip label="Favorite" icon={Heart} tone="pink" />
      </div>

      <Divider />
      <LabelBlock title="Aliases" labels={config.aliases} />
      <Divider />
      <LabelBlock title="Categories" labels={config.categories} />
    </section>
  );
}

function PerformerSummaryCards({ config }: { config: PerformerDetailConfig }) {
  const icons = [Calendar, Clapperboard, FileImage];

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {config.summary.map((item, index) => {
        const Icon = icons[index] ?? Info;

        return (
          <div
            key={item.label}
            className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-5"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500">
              <Icon size={22} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">
                {item.label}
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-950">
                {item.value}
              </p>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function LargePlaceholder({ config }: DetailPageProps) {
  const Icon = config.placeholderIcon;
  const aspectClass =
    config.kind === "performers" ? "aspect-[1.18/1]" : "aspect-video";

  return (
    <div
      className={`${aspectClass} flex min-h-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 via-white to-sakura-50 text-slate-300`}
    >
      <div className="flex flex-col items-center gap-3">
        <Icon size={config.kind === "performers" ? 86 : 74} strokeWidth={1.5} />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-500">
            {config.placeholderLabel}
          </p>
          {config.kind === "videos" && (
            <p className="mt-2 text-sm text-slate-400">16:9</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SmallThumbnail({ label }: { label: string }) {
  return (
    <div className="aspect-square rounded-lg bg-gradient-to-br from-slate-100 via-white to-sakura-50">
      <div className="flex h-full items-center justify-center text-slate-300">
        <ImageIcon size={24} aria-label={label} />
      </div>
    </div>
  );
}

function RowsCard({
  title,
  icon: Icon,
  items,
  message,
  readOnly = false,
}: {
  title: string;
  icon: typeof Info;
  items: { label: string; value: string }[];
  message?: string;
  readOnly?: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <CardTitle title={title} icon={Icon} />
      {message && <p className="mt-3 text-xs text-slate-500">{message}</p>}
      <div className="mt-4 divide-y divide-slate-100">
        {items.map((item) => (
          <div
            key={item.label}
            className="grid grid-cols-[1fr_1.1fr] gap-4 py-3 text-sm"
          >
            <span className="font-medium text-slate-700">{item.label}</span>
            <span className="text-slate-500">{item.value}</span>
          </div>
        ))}
      </div>
      {readOnly && (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
          Read-only placeholder
        </p>
      )}
    </section>
  );
}

function RatingSummaryCard({
  title,
  rating,
}: {
  title: string;
  rating: { label: string; value: number }[];
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <CardTitle title={title} icon={Star} />
      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_230px]">
        <div className="space-y-3">
          {rating.map((axis) => (
            <div
              key={axis.label}
              className="grid grid-cols-[1fr_44px_112px] items-center gap-3 text-sm"
            >
              <span className="font-medium text-slate-700">{axis.label}</span>
              <span className="text-right text-slate-600">
                {axis.value.toFixed(1)}
              </span>
              <Stars value={axis.value} />
            </div>
          ))}
        </div>
        <RadarPlaceholder rating={rating} />
      </div>
    </section>
  );
}

function RadarPlaceholder({
  rating,
}: {
  rating: { label: string; value: number }[];
}) {
  const labels = rating.slice(0, 6);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[230px]">
      <div className="absolute inset-8 rounded-full border border-sakura-100 bg-sakura-50/45" />
      <div className="absolute inset-14 rounded-full border border-sakura-100" />
      <div className="absolute inset-[4.5rem] rounded-full border border-sakura-100" />
      <div
        className="absolute inset-11 bg-sakura-300/35"
        style={{
          clipPath:
            "polygon(50% 0%, 82% 20%, 83% 72%, 50% 94%, 18% 76%, 17% 24%)",
        }}
      />
      <div
        className="absolute inset-11 border-2 border-sakura-400"
        style={{
          clipPath:
            "polygon(50% 0%, 82% 20%, 83% 72%, 50% 94%, 18% 76%, 17% 24%)",
        }}
      />
      {labels.map((axis, index) => (
        <span
          key={axis.label}
          className={[
            "absolute text-[11px] font-medium text-slate-500",
            radarLabelClass(index),
          ].join(" ")}
        >
          {axis.label}
        </span>
      ))}
    </div>
  );
}

function radarLabelClass(index: number) {
  const classes = [
    "left-1/2 top-0 -translate-x-1/2",
    "right-0 top-1/4",
    "right-1 bottom-1/4",
    "bottom-0 left-1/2 -translate-x-1/2",
    "bottom-1/4 left-0",
    "left-0 top-1/4",
  ];

  return classes[index] ?? "";
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-1 text-sakura-500" aria-label={`${value}/5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={15}
          fill={index + 1 <= Math.round(value) ? "currentColor" : "none"}
          className={index + 1 <= Math.round(value) ? "" : "text-slate-300"}
        />
      ))}
    </span>
  );
}

function NotesCard({ notes }: { notes: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <CardTitle title="Notes" icon={FileImage} />
      <div className="mt-4 rounded-lg border border-sakura-100 bg-sakura-50/30 px-4 py-3">
        <p className="text-sm leading-6 text-slate-500">{notes}</p>
      </div>
    </section>
  );
}

function RelatedRows({
  sections,
}: {
  sections: { title: string; description: string }[];
}) {
  return (
    <section className="space-y-3">
      {sections.map((section) => (
        <div
          key={section.title}
          className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-4"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-400">
            {section.title.includes("Image") ? (
              <ImageIcon size={17} />
            ) : section.title.includes("Video") ? (
              <Film size={17} />
            ) : (
              <UserRound size={17} />
            )}
          </div>
          <p className="min-w-[150px] text-sm font-semibold text-slate-800">
            {section.title}
          </p>
          <p className="text-sm text-slate-500">{section.description}</p>
        </div>
      ))}
    </section>
  );
}

function GalleryGrid({ labels }: { labels: string[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <CardTitle title="Gallery Grid" icon={ImageIcon} />
      <div className="mt-4 grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {[...labels, ...labels].map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="aspect-[1.35/1] rounded-lg bg-gradient-to-br from-slate-100 via-white to-sakura-50"
          >
            <div className="flex h-full items-center justify-center text-slate-300">
              <ImageIcon size={34} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CardTitle({
  title,
  icon: Icon,
}: {
  title: string;
  icon: typeof Info;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={18} className="text-sakura-500" />
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
    </div>
  );
}

function LabelBlock({ title, labels }: { title: string; labels: string[] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {labels.map((label) => (
          <Chip key={label} label={label} tone="pinkSoft" />
        ))}
      </div>
    </div>
  );
}

function Chip({
  label,
  tone,
  icon: Icon,
}: {
  label: string;
  tone: "green" | "orange" | "pink" | "pinkSoft" | "neutral";
  icon?: typeof Heart;
}) {
  const toneClass = {
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    orange: "border-orange-100 bg-orange-50 text-orange-600",
    pink: "border-sakura-100 bg-sakura-50 text-sakura-600",
    pinkSoft: "border-sakura-100 bg-sakura-50/70 text-sakura-600",
    neutral: "border-slate-200 bg-slate-100 text-slate-600",
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${toneClass}`}
    >
      {Icon && <Icon size={14} fill="currentColor" />}
      {label}
    </span>
  );
}

function Divider() {
  return <div className="my-5 border-t border-dashed border-slate-200" />;
}

export default DetailPage;
