import { Image as ImageIcon } from "lucide-react";

function ContentThumbnailPlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sakura-50 text-sakura-200">
      <div className="flex size-12 items-center justify-center rounded-full border border-sakura-100 bg-white/85 shadow-sm">
        <ImageIcon size={24} strokeWidth={1.7} />
      </div>
    </div>
  );
}

export default ContentThumbnailPlaceholder;
