"""Vector store service using ChromaDB."""

import logging
from typing import Optional
import uuid

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import get_settings
from app.services.embedder import embed_text, embed_texts

logger = logging.getLogger(__name__)
settings = get_settings()

# ChromaDB client singleton
_client: Optional[chromadb.PersistentClient] = None
_collection: Optional[chromadb.Collection] = None

COLLECTION_NAME = "podcast_chunks"


def get_client() -> chromadb.PersistentClient:
    """Get or create the ChromaDB client."""
    global _client

    if _client is None:
        logger.info(f"Initializing ChromaDB at {settings.chroma_path}")
        _client = chromadb.PersistentClient(
            path=str(settings.chroma_dir),
            settings=ChromaSettings(
                anonymized_telemetry=False,
            ),
        )
        logger.info("ChromaDB client initialized")

    return _client


def get_collection() -> chromadb.Collection:
    """Get or create the podcast chunks collection."""
    global _collection

    if _collection is None:
        client = get_client()
        _collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"description": "Podcast transcript chunks for semantic search"},
        )
        logger.info(f"ChromaDB collection '{COLLECTION_NAME}' ready")

    return _collection


def add_chunks(
    chunks: list[dict],
    podcast_id: str,
    podcast_title: Optional[str] = None,
) -> list[str]:
    """
    Add chunks to the vector store.

    Args:
        chunks: List of chunk dictionaries with 'text', 'start_time', 'end_time'
        podcast_id: ID of the podcast these chunks belong to
        podcast_title: Title of the podcast for metadata

    Returns:
        List of ChromaDB document IDs
    """
    if not chunks:
        return []

    collection = get_collection()

    # Generate IDs for each chunk
    ids = [str(uuid.uuid4()) for _ in chunks]

    # Extract texts for embedding
    texts = [chunk['text'] for chunk in chunks]

    # Generate embeddings
    embeddings = embed_texts(texts)

    # Prepare metadata
    metadatas = []
    for chunk in chunks:
        metadata = {
            'podcast_id': podcast_id,
            'start_time': chunk.get('start_time', 0.0),
            'end_time': chunk.get('end_time', 0.0),
        }
        if podcast_title:
            metadata['podcast_title'] = podcast_title
        metadatas.append(metadata)

    # Add to collection
    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=texts,
        metadatas=metadatas,
    )

    logger.info(f"Added {len(chunks)} chunks to vector store for podcast {podcast_id}")
    return ids


def search(
    query: str,
    limit: int = 10,
    podcast_id: Optional[str] = None,
) -> list[dict]:
    """
    Search for similar chunks.

    Args:
        query: Search query text
        limit: Maximum number of results to return
        podcast_id: Optional filter to search only within a specific podcast

    Returns:
        List of search results with chunk info and scores
    """
    collection = get_collection()

    # Generate query embedding
    query_embedding = embed_text(query)

    # Build where filter
    where = None
    if podcast_id:
        where = {"podcast_id": podcast_id}

    # Query the collection
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=limit,
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    # Format results
    formatted_results = []

    if results and results['ids'] and results['ids'][0]:
        for i, doc_id in enumerate(results['ids'][0]):
            # Convert distance to similarity score (ChromaDB uses L2 distance)
            # Lower distance = higher similarity
            distance = results['distances'][0][i] if results['distances'] else 0
            score = 1 / (1 + distance)  # Convert to 0-1 score

            formatted_results.append({
                'chunk_id': doc_id,
                'text': results['documents'][0][i] if results['documents'] else '',
                'podcast_id': results['metadatas'][0][i].get('podcast_id', ''),
                'podcast_title': results['metadatas'][0][i].get('podcast_title'),
                'start_time': results['metadatas'][0][i].get('start_time'),
                'end_time': results['metadatas'][0][i].get('end_time'),
                'score': score,
            })

    logger.info(f"Search query '{query[:50]}...' returned {len(formatted_results)} results")
    return formatted_results


def delete_podcast_chunks(podcast_id: str) -> int:
    """
    Delete all chunks for a podcast from the vector store.

    Args:
        podcast_id: ID of the podcast to delete chunks for

    Returns:
        Number of chunks deleted
    """
    collection = get_collection()

    # Get all chunk IDs for this podcast
    results = collection.get(
        where={"podcast_id": podcast_id},
        include=[],
    )

    if results and results['ids']:
        chunk_ids = results['ids']
        collection.delete(ids=chunk_ids)
        logger.info(f"Deleted {len(chunk_ids)} chunks for podcast {podcast_id}")
        return len(chunk_ids)

    return 0


def get_collection_stats() -> dict:
    """Get statistics about the vector store."""
    collection = get_collection()
    count = collection.count()

    return {
        'collection_name': COLLECTION_NAME,
        'total_chunks': count,
    }
