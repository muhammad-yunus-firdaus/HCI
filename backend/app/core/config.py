from pathlib import Path

from dotenv import load_dotenv
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

env_path = Path(__file__).resolve().parent.parent.parent / ".env"
default_sqlite_db_path = str((env_path.parent / "research.db").resolve())
# override=True agar nilai di file .env diprioritaskan
load_dotenv(dotenv_path=env_path, override=True)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(env_path),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "Research AI API"
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://127.0.0.1:5500"
    ALLOWED_ORIGINS: str = "*"

    # provider aktif ("mock", "gemini", "openai", "claude")
    ACTIVE_MODEL: str = Field(
        default="mock",
        validation_alias=AliasChoices("ACTIVE_MODEL", "AI_PROVIDER"),
    )
    STRICT_TASK_TOPIC: bool = True

    # database
    DATABASE_URL: str | None = None
    SQLITE_DB_PATH: str = default_sqlite_db_path
    RESET_DB_ON_STARTUP: bool = False

    # api keys & model configs
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL_NAME: str = "gemini-2.5-flash"
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL_NAME: str = "gpt-5.6-luna"
    CLAUDE_API_KEY: str | None = Field(
        default=None,
        validation_alias=AliasChoices("CLAUDE_API_KEY", "ANTHROPIC_API_KEY"),
    )
    ANTHROPIC_MODEL_NAME: str = "claude-3-5-sonnet-latest"
    EXPORT_PASSWORD: str = "admin123"


settings = Settings()
