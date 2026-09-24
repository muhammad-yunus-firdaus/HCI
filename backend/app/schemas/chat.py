from __future__ import annotations

from pydantic import BaseModel
from uuid import UUID


from typing import Optional

class ChatInput(BaseModel):
    p_id: UUID
    message: str
    waktu_berpikir_ms: Optional[int] = None
