import axios from "axios";

const api = axios.create({ baseURL: "/api" });

// --- Projects ---
export const getProjects = () => api.get("/projects/").then((r) => r.data);
export const createProject = (data) => api.post("/projects/", data).then((r) => r.data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);

// --- Classes ---
export const getClasses = (projectId) =>
  api.get(`/projects/${projectId}/classes/`).then((r) => r.data);
export const createClass = (projectId, data) =>
  api.post(`/projects/${projectId}/classes/`, data).then((r) => r.data);
export const updateClass = (projectId, classId, data) =>
  api.patch(`/projects/${projectId}/classes/${classId}`, data).then((r) => r.data);
export const deleteClass = (projectId, classId) =>
  api.delete(`/projects/${projectId}/classes/${classId}`);
export const reorderClasses = (projectId, order) =>
  api.patch(`/projects/${projectId}/classes/reorder`, { order }).then((r) => r.data);

// --- Images ---
export const getImages = (projectId) =>
  api.get(`/projects/${projectId}/images/`).then((r) => r.data);
export const uploadImages = (projectId, files) => {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return api.post(`/projects/${projectId}/images/`, form).then((r) => r.data);
};
export const getThumbnailUrl = (projectId, imageId) =>
  `/api/projects/${projectId}/images/${imageId}/thumbnail`;
export const getImageFileUrl = (projectId, imageId) =>
  `/api/projects/${projectId}/images/${imageId}/file`;

// --- Annotations ---
export const getAnnotations = (projectId, imageId) =>
  api.get(`/projects/${projectId}/images/${imageId}/annotations/`).then((r) => r.data);
export const createAnnotation = (projectId, imageId, data) =>
  api
    .post(`/projects/${projectId}/images/${imageId}/annotations/`, data)
    .then((r) => r.data);
export const updateAnnotation = (projectId, imageId, annotationId, data) =>
  api
    .patch(`/projects/${projectId}/images/${imageId}/annotations/${annotationId}`, data)
    .then((r) => r.data);
export const deleteAnnotation = (projectId, imageId, annotationId) =>
  api.delete(`/projects/${projectId}/images/${imageId}/annotations/${annotationId}`);

// --- Inference ---
export const predictFromPoints = (imageId, points, box = null, signal = undefined) =>
  api.post("/inference/point", { image_id: imageId, points, box }, { signal }).then((r) => r.data);
export const precomputeEmbedding = (imageId) =>
  api.post("/inference/precompute", { image_id: imageId }).catch(() => {}); // fire-and-forget

// --- Export ---
export const exportProject = (projectId, format, splits) =>
  api
    .post(`/projects/${projectId}/export/`, { format, splits }, { responseType: "blob" })
    .then((r) => r.data);
