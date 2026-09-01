# Build stage: composer deps (platform requirements incl. bcmath)
FROM php:8.4-cli-alpine AS composer-build
RUN docker-php-ext-install bcmath pdo_mysql && \
    curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-scripts --no-interaction --prefer-dist

# Runtime: FrankenPHP + Node + pnpm (Node stage needs PHP for wayfinder:generate)
FROM dunglas/frankenphp:1 AS app
WORKDIR /app

# PHP extensions
RUN install-php-extensions pdo_mysql redis bcmath pcntl

# Node.js + pnpm for asset build
RUN apt-get update && \
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Laravel app + composer deps
COPY . /app
COPY --from=composer-build /app/vendor /app/vendor

# Build frontend assets
ENV CI=true
# Generate autoloader before pnpm build (wayfinder needs artisan; no-autoloader install skips it)
RUN composer dump-autoload --no-interaction 2>/dev/null; \
    php artisan key:generate --force 2>/dev/null || true; \
    pnpm install && pnpm run build

# Prod autoloader
RUN composer dump-autoload --optimize --classmap-authoritative --no-interaction 2>/dev/null || true

# Entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

RUN echo "upload_max_filesize = 400M" >> /usr/local/etc/php/php.ini && \
    echo "post_max_size = 500M" >> /usr/local/etc/php/php.ini

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]