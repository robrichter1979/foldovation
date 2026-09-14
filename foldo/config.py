from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    cors_origin: str = "http://localhost:3000"
    mappings_path: str = "mappings/all_foldo_mappings_v1.json"
    hidden_image_path: str = "image_data/hidden_v3.png"
    background_image_path: str = "image_data/background_v4.png"
    default_image_path: str = "image_data/square_image.jpg"
    sample_image_path: str = "image_data/template_tiger_family.png"
    token_db: str = "tokens.db"
    samples_cache_path: str = "image_data/mapping_samples_cache.json"
    required_images: int = 10
    gmail_app_password: str = ""
    app_url: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
