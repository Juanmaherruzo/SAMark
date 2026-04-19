import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getImages, getThumbnailUrl, uploadImages, precomputeEmbedding } from "../../api";
import { useAnnotatorStore } from "../../store";

const STATUS_DOT = {
  unannotated: "bg-gray-500",
  in_progress:  "bg-yellow-400",
  annotated:    "bg-green-400",
};

export default function ImageGallery({ projectId }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const { currentImage, setCurrentImage, setImages } = useAnnotatorStore();

  const { data: images = [] } = useQuery({
    queryKey: ["images", projectId],
    queryFn: () => getImages(projectId),
    enabled: !!projectId,
  });

  const handleFileInput = async (e) => {
    const files = [...e.target.files].filter((f) =>
      ["image/jpeg", "image/png"].includes(f.type)
    );
    if (!files.length) return;
    await uploadImages(projectId, files);
    qc.invalidateQueries({ queryKey: ["images", projectId] });
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-2 px-3 h-full bg-panel overflow-x-auto">
      {/* Upload button */}
      <button
        className="flex-shrink-0 w-20 h-20 rounded border-2 border-dashed border-gray-600
                   hover:border-blue-400 flex flex-col items-center justify-center
                   text-gray-500 hover:text-blue-400 text-xs transition gap-1"
        onClick={() => fileRef.current?.click()}
        title="Upload images (or drag & drop onto the page)"
      >
        <span className="text-2xl leading-none">+</span>
        <span>Upload</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Thumbnail strip */}
      {images.map((img) => (
        <div
          key={img.id}
          className={`relative flex-shrink-0 w-20 h-20 rounded cursor-pointer overflow-hidden
            border-2 transition
            ${img.id === currentImage?.id
              ? "border-blue-400 ring-1 ring-blue-400"
              : "border-gray-700 hover:border-gray-400"}`}
          onClick={() => { setCurrentImage(img); precomputeEmbedding(img.id); }}
          title={img.filename}
        >
          <img
            src={getThumbnailUrl(projectId, img.id)}
            alt={img.filename}
            className="w-full h-full object-cover"
          />
          {/* Status dot */}
          <span
            className={`absolute bottom-1 right-1 w-2 h-2 rounded-full ${STATUS_DOT[img.status] ?? "bg-gray-500"}`}
          />
        </div>
      ))}

      {images.length === 0 && (
        <p className="text-gray-600 text-xs px-2">
          No images — drag & drop JPG/PNG here or click Upload
        </p>
      )}
    </div>
  );
}
