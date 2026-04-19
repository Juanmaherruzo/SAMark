import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getProjects } from "../../api";

export default function ProjectSidebar({ projectId }) {
  const navigate = useNavigate();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects,
  });

  const current = projects.find((p) => p.id === projectId);

  return (
    <div className="p-3">
      <button
        className="text-gray-400 hover:text-white text-xs mb-3 flex items-center gap-1"
        onClick={() => navigate("/projects")}
      >
        &larr; Projects
      </button>
      {current && (
        <div>
          <p className="font-semibold truncate">{current.name}</p>
          <p className="text-xs text-gray-400 mt-1">{current.task_type}</p>
        </div>
      )}
    </div>
  );
}
