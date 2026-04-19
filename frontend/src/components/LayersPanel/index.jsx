import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteAnnotation } from "../../api";
import { useAnnotatorStore } from "../../store";

export default function LayersPanel() {
  const {
    projectId, currentImage, annotations, classes,
    selectedAnnotationId, setSelectedAnnotation, removeAnnotation,
  } = useAnnotatorStore();
  const qc = useQueryClient();

  const remove = useMutation({
    mutationFn: (annId) => deleteAnnotation(projectId, currentImage.id, annId),
    onSuccess: (_, annId) => {
      removeAnnotation(annId);
      qc.invalidateQueries({ queryKey: ["images"] });
    },
  });

  return (
    <div className="p-3 h-full overflow-y-auto">
      <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Instances</p>

      {annotations.length === 0 && (
        <p className="text-gray-600 text-xs">No annotations yet</p>
      )}

      {annotations.map((ann, i) => {
        const cls = classes.find((c) => c.id === ann.class_id);
        return (
          <div
            key={ann.id}
            className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer mb-1 text-sm
              ${ann.id === selectedAnnotationId ? "bg-accent" : "hover:bg-gray-800"}`}
            onClick={() => setSelectedAnnotation(ann.id)}
          >
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: cls?.color ?? "#888" }}
            />
            <span className="flex-1 truncate text-xs">
              {cls?.name ?? "unknown"} #{i + 1}
            </span>
            <button
              className="text-gray-600 hover:text-red-400 text-xs"
              onClick={(e) => { e.stopPropagation(); remove.mutate(ann.id); }}
            >
              x
            </button>
          </div>
        );
      })}
    </div>
  );
}
