from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

try:
    from app.api.router import api_router
    from app.core.config import settings
    from app.db.init_db import init_db
    from app.db.session import SessionLocal
except ImportError:
    from backend.app.api.router import api_router
    from backend.app.core.config import settings
    from backend.app.db.init_db import init_db
    from backend.app.db.session import SessionLocal


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

# Setup CORS Middleware
raw_origins = settings.ALLOWED_ORIGINS.strip()
if raw_origins == "*" or "*" in raw_origins:
    origins_list = ["*"]
else:
    origins_list = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    default_local = [
        "http://localhost",
        "http://127.0.0.1",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        settings.FRONTEND_URL,
    ]
    origins_list = list(set(origins_list + default_local))

from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins_list,
    allow_origin_regex=r"https://.*\.devtunnels\.ms|https://.*\.github\.dev",
    allow_credentials=True if origins_list != ["*"] else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

@app.get("/health")
def health():
    try:
        from sqlalchemy import text
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    return {
        "status": "ok",
        "database": db_status,
        "environment": settings.ENVIRONMENT,
        "active_model": settings.ACTIVE_MODEL
    }

@app.get("/")
def root():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_path = os.path.join(current_dir, "..", "frontend", "index.html")
    
    if os.path.exists(frontend_path):
        return FileResponse(frontend_path)
    
    return {
        "status": "error",
        "message": f"Frontend tidak ditemukan di {frontend_path}. Pastikan folder 'frontend' ada di root project.",
        "debug_path": frontend_path
    }

frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir), name="frontend")