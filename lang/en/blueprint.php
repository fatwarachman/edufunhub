<?php

return [
    'pick_file' => 'Choose a question blueprint file.',
    'unsupported' => 'Unsupported file type. Use PDF, DOCX, XLSX, TXT, MD or CSV.',
    'too_big' => 'The file may be at most :max MB.',
    'unreadable' => 'The file cannot be read. Make sure it is not damaged or password protected.',
    'no_text' => 'No blueprint text was found. Scanned/image PDFs are not supported yet; use a text PDF, DOCX or XLSX.',
    'uploaded' => 'Blueprint ":title" uploaded and ready for the AI.',
    'saved' => 'Question blueprint saved.',
    'deleted' => 'Question blueprint deleted.',
    'invalid' => 'The question blueprint is missing or inactive.',
    'reindexing' => 'The blueprint is being reindexed.',
    'embedding_off' => 'No embedding model is set.',
    'embedding_http' => 'The AI server answered HTTP :status for embedding model :model. Make sure the model supports /embeddings.',
    'embedding_bad' => 'The embedding reply from model :model could not be read.',
    'embedding_saved' => 'Embedding model :model saved. All blueprints are being reindexed.',
    'embedding_cleared' => 'Semantic search turned off. Blueprints use keyword search.',
];
