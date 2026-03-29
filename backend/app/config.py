"""Application configuration via environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    app_env: str = "development"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:3000"

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/db/research_monitor.db"

    # API Keys
    ncbi_api_key: str = ""
    semantic_scholar_api_key: str = ""
    ieee_api_key: str = ""
    zotero_api_key: str = ""
    zotero_user_id: str = ""

    # Storage paths
    pdf_storage_path: str = "./data/pdfs"
    registry_path: str = "./data/registry"
    reports_path: str = "./data/reports"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def pdf_dir(self) -> Path:
        p = Path(self.pdf_storage_path)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def registry_dir(self) -> Path:
        p = Path(self.registry_path)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def reports_dir(self) -> Path:
        p = Path(self.reports_path)
        p.mkdir(parents=True, exist_ok=True)
        return p

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
