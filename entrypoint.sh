#!/bin/sh

# Run database migrations
php artisan migrate --force

# Official school list for the school picker (first boot only, ~25 s)
php artisan schools:import --if-empty || true

# Recorded app changelog (database/data/changelog.php) for the admin Changelog page
php artisan changelog:sync || true

# Cache config + views (skip route cache — starter has duplicate route name collision)
php artisan config:cache
php artisan view:cache

# queue work in background
php artisan queue:work --queue=high,low &

# Start Reverb WebSocket server in background (skip on error, optional)
php artisan reverb:start --host=0.0.0.0 --port=8080 2>/dev/null &

# Start the server (plain PHP dev server — robust for docker stack)
exec php artisan serve --host=0.0.0.0 --port=8000