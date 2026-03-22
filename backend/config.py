from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str = "dev-secret-key-change-in-production"
    database_url: str = "./trail.db"
    vault_path: str = "./vault"
    vault_name: str = "TeamVault"
    project_folder: str = "200_Projects"
    access_token_expire_days: int = 30

    class Config:
        env_file = ".env"


settings = Settings()
