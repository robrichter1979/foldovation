from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    cors_origin: str = "http://localhost:3000"
    mappings_path: str = "mappings/all_foldo_mappings_v2.json"
    hidden_image_path: str = "image_data/hidden_v5.png"
    background_image_path: str = "image_data/background_v5.png"
    default_image_path: str = "image_data/square_image.jpg"
    sample_image_path: str = "image_data/Template_Familie_01.png"
    token_db: str = "tokens.db"
    samples_cache_path: str = "image_data/mapping_samples_cache.json"
    fold_instructions_path: str = "image_data/fold_instructions.png"
    required_images: int = 25
    gmail_app_password: str = ""
    internal_email: str = "photogami.shop@gmail.com"
    app_url: str = "http://localhost:3000"
    admin_password: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
