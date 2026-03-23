import os
import sys

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str = ""
    database_url: str = "./trail.db"
    vault_path: str = "./vault"
    vault_name: str = "TeamVault"
    project_folder: str = "200_Projects"
    access_token_expire_hours: int = 1
    refresh_token_expire_days: int = 30
    lm_studio_url: str = "http://localhost:1234/v1"
    lm_studio_model: str = "local-model"

    class Config:
        env_file = ".env"


settings = Settings()

# D-2: Refuse to start if secret_key is not configured (except for testing)
if not settings.secret_key:
    if os.environ.get("TRAIL_TESTING"):
        settings.secret_key = "test-secret-key-for-testing-only"
    else:
        print("❌ SECRET_KEY が設定されていません。.env ファイルに SECRET_KEY を設定してください。")
        sys.exit(1)
