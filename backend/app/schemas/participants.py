from __future__ import annotations

from pydantic import BaseModel
from typing import Optional
from uuid import UUID


class ParticipantOut(BaseModel):
    id_partisipan: UUID
    id_tahap_sekarang: int
    apakah_selesai: bool

    model_config = {"from_attributes": True}


class DemographicsInput(BaseModel):
    usia: str
    gender: str
    background: str
    detail_background: Optional[str] = None
    pernah_berinteraksi_ai: str


class TaskInfoOut(BaseModel):
    id_tugas: int
    kode_tugas: str
    mode: str
    teks_instruksi: str

    model_config = {"from_attributes": True}
