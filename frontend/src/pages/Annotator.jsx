import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getImages, getClasses, getProjects, uploadImages } from "../api";
import { useAnnotatorStore } from "../store";
import ProjectSidebar from "../components/ProjectSidebar";
import ImageGallery from "../components/ImageGallery";
import AnnotatorCanvas from "../components/Canvas";
import LayersPanel from "../components/LayersPanel";
import ClassManager from "../components/ClassManager";
import PromptTools from "../components/PromptTools";

export default function Annotator() {
  const { projectId } = useParams();
  const qc = useQueryClient();
  const { setProject, setClasses, setImages, setTaskType } = useAnnotatorStore();
  const dropRef = useRef(null);

  useEffect(() => {
    setProject(Number(projectId));
  }, [projectId, setProject]);

  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: getProjects });
  useEffect(() => {
    const proj = projects?.find((p) => p.id === Number(projectId));
    if (proj) setTaskType(proj.task_type);
  }, [projects, projectId, setTaskType]);

  const { data: classes } = useQuery({
    queryKey: ["classes", projectId],
    queryFn: () => getClasses(projectId),
    enabled: !!projectId,
  });

  const { data: images } = useQuery({
    queryKey: ["images", projectId],
    queryFn: () => getImages(projectId),
    enabled: !!projectId,
  });

  useEffect(() => { if (classes) setClasses(classes); }, [classes, setClasses]);
  useEffect(() => { if (images) setImages(images); }, [images, setImages]);

  // --- Drag & drop image upload on the whole annotator area ---
  const handleDrop = async (e) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter((f) =>
      ["image/jpeg", "image/png"].includes(f.type)
    );
    if (!files.length) return;
    await uploadImages(projectId, files);
    qc.invalidateQueries({ queryKey: ["images", projectId] });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  return (
    <div
      className="flex h-screen overflow-hidden bg-surface text-white"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      ref={dropRef}
    >
      {/* Left sidebar */}
      <div className="w-56 flex-shrink-0 bg-panel border-r border-gray-700 flex flex-col overflow-hidden">
        <ProjectSidebar projectId={Number(projectId)} />
        <ClassManager />
      </div>

      {/* Center: toolbar + canvas + gallery */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <PromptTools projectId={Number(projectId)} />
        <div className="flex-1 relative overflow-hidden">
          <AnnotatorCanvas />
        </div>
        <div className="h-28 flex-shrink-0 border-t border-gray-700">
          <ImageGallery projectId={Number(projectId)} />
        </div>
      </div>

      {/* Right sidebar: layers */}
      <div className="w-52 flex-shrink-0 bg-panel border-l border-gray-700 overflow-y-auto">
        <LayersPanel />
      </div>
    </div>
  );
}
