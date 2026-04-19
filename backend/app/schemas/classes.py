from pydantic import BaseModel, Field


class ClassCreate(BaseModel):
    name: str
    color: str = Field(default="#FF0000", pattern=r"^#[0-9A-Fa-f]{6}$")


class ClassRead(BaseModel):
    id: int
    project_id: int
    name: str
    color: str
    yolo_index: int

    model_config = {"from_attributes": True}


class ClassUpdate(BaseModel):
    name: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    yolo_index: int | None = None


class ClassReorderItem(BaseModel):
    id: int
    yolo_index: int


class ClassReorderRequest(BaseModel):
    order: list[ClassReorderItem]
