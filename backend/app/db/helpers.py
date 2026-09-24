from __future__ import annotations

from uuid import UUID
from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import Partisipan


def get_participant(db: Session, p_id: UUID) -> Partisipan:
    p_id_str = str(p_id)
    participant = db.query(Partisipan).filter(Partisipan.id_partisipan == p_id_str).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    return participant
