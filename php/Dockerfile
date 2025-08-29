FROM php:8.3-fpm-alpine

# Install system deps, PHP extensions, and PhpRedis in ONE layer
RUN set -eux && \
    apk add --no-cache \
        bash \
        curl \
        git \
        unzip \
        mariadb-client \
        libpng-dev \
        libjpeg-turbo-dev \
        freetype-dev \
        oniguruma-dev \
        libzip-dev \
        zlib-dev \
        icu-dev && \
    apk add --no-cache --virtual .build-deps \
        $PHPIZE_DEPS \
        openssl-dev \
        zlib-dev && \
    docker-php-ext-configure gd --with-freetype --with-jpeg && \
    docker-php-ext-install -j"$(nproc)" \
        gd \
        mbstring \
        zip \
        pdo \
        pdo_mysql \
        mysqli \
        intl && \
    pecl install redis && \
    docker-php-ext-enable redis && \
    apk del .build-deps

# WP-CLI
RUN curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp \
  && chmod +x /usr/local/bin/wp

# PHP settings
COPY php.ini /usr/local/etc/php/conf.d/99-custom.ini

# Entrypoint (auto-deploy WP + plugins)
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /var/www/html

# Align UID/GID of www-data to match nginx (33:33)
RUN apk add --no-cache shadow \
  && usermod -u 33 www-data \
  && groupmod -g 33 www-data \
  && chown -R www-data:www-data /var/www

USER www-data

ENTRYPOINT ["entrypoint.sh"]
CMD ["php-fpm"]
