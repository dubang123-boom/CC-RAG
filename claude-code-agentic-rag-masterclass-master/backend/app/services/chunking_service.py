from dataclasses import dataclass
import tiktoken

ENCODING_NAME = "cl100k_base"


@dataclass
class Chunk:
    content: str
    chunk_index: int
    token_count: int


def chunk_text(
    text: str,
    chunk_size: int = 512,
    chunk_overlap: int = 64,
) -> list[Chunk]:
    """
    Split text into overlapping token-bounded chunks.
    Returns list of Chunk objects with content, index, and token count.
    """
    enc = tiktoken.get_encoding(ENCODING_NAME)
    tokens = enc.encode(text)
    chunks: list[Chunk] = []
    start = 0
    index = 0

    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]
        content = enc.decode(chunk_tokens)
        chunks.append(Chunk(
            content=content,
            chunk_index=index,
            token_count=len(chunk_tokens),
        ))
        if end == len(tokens):
            break
        start += chunk_size - chunk_overlap
        index += 1

    return chunks
