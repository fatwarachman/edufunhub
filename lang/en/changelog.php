<?php

return [
    'flash' => [
        'created' => 'Changelog note for version :version added.',
        'updated' => 'Changelog note for version :version saved.',
        'deleted' => 'Changelog note for version :version deleted.',
    ],
    'validation' => [
        'version_required' => 'Enter a version number.',
        'version_format' => 'The version must follow Semantic Versioning, e.g. 0.1.0 or 1.0.0-beta.1.',
        'title_required' => 'Enter a title for the change.',
        'body_required' => 'Describe the change.',
        'type' => 'Choose a change type: new feature, improvement or fix.',
        'recorded' => 'This change is recorded from the release history and cannot be edited or deleted here.',
    ],
];
