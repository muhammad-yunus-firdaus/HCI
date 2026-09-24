from fastapi import APIRouter

from .endpoints import chat, participants

api_router = APIRouter()
api_router.include_router(participants.router, tags=["participants"])
api_router.include_router(chat.router, tags=["chat"])
