from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "K-Synthesizer API"
    environment: str = "development"
    frontend_url: str = "http://localhost:3000"
    ai_engine_url: str = "http://localhost:8200"
    mt5_bridge_url: str = "http://localhost:8100"
    use_mock: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
