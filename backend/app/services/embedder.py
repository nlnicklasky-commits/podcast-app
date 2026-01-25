"""Embedding service using sentence-transformers."""

import logging
from typing import Optional

from sentence_transformers import SentenceTransformer

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Cache for the loaded model
_model_cache: dict[str, SentenceTransformer] = {}


def get_model(model_name: Optional[str] = None) -> SentenceTransformer:
    """
    Get or load a sentence-transformers model.

    Args:
        model_name: Name of the model to load (default from settings)

    Returns:
        Loaded SentenceTransformer model
    """
    model_name = model_name or settings.embedding_model

    if model_name not in _model_cache:
        logger.info(f"Loading embedding model: {model_name}")
        _model_cache[model_name] = SentenceTransformer(model_name)
        logger.info(f"Embedding model {model_name} loaded")

    return _model_cache[model_name]


def embed_text(text: str, model_name: Optional[str] = None) -> list[float]:
    """
    Generate embeddings for a single text.

    Args:
        text: Text to embed
        model_name: Model to use (default from settings)

    Returns:
        List of floats representing the embedding
    """
    model = get_model(model_name)
    embedding = model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


def embed_texts(texts: list[str], model_name: Optional[str] = None) -> list[list[float]]:
    """
    Generate embeddings for multiple texts in batch.

    This is more efficient than embedding one at a time.

    Args:
        texts: List of texts to embed
        model_name: Model to use (default from settings)

    Returns:
        List of embeddings (each embedding is a list of floats)
    """
    if not texts:
        return []

    logger.info(f"Embedding {len(texts)} texts")
    model = get_model(model_name)
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
    logger.info(f"Embedded {len(texts)} texts successfully")

    return embeddings.tolist()


def get_embedding_dimension(model_name: Optional[str] = None) -> int:
    """
    Get the dimension of embeddings for a model.

    Args:
        model_name: Model to check (default from settings)

    Returns:
        Embedding dimension
    """
    model = get_model(model_name)
    return model.get_sentence_embedding_dimension()
