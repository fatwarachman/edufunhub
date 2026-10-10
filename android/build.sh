#!/usr/bin/env bash
# Builds the signed Play Store bundle (.aab) and an installable .apk for the
# EduFunHub Android app inside Docker. Secrets stay outside the repository.
#
#   android/build.sh            build release AAB + APK into android/dist/
#   android/build.sh keystore   create the upload key once (prints SHA-256)
#   android/build.sh fingerprint print the SHA-256 for assetlinks.json
set -euo pipefail

ANDROID_DIR="$(cd "$(dirname "$0")" && pwd)"
SECRETS_DIR="${EDUFUNHUB_ANDROID_SECRETS:-/root/.edufunhub-android}"
KEYSTORE="$SECRETS_DIR/edufunhub-upload.keystore"
PASSWORD_FILE="$SECRETS_DIR/keystore.password"
IMAGE="edufunhub-android-builder:latest"
KEY_ALIAS="edufunhub"

ensure_image() {
    if ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
        docker build -t "$IMAGE" -f "$ANDROID_DIR/Dockerfile.build" "$ANDROID_DIR"
    fi
}

run_builder() {
    docker run --rm \
        -v "$ANDROID_DIR":/project \
        -v "$SECRETS_DIR":/secrets:ro \
        -v edufunhub-android-gradle:/gradle-cache \
        -e EDUFUNHUB_KEYSTORE_PATH=/secrets/edufunhub-upload.keystore \
        -e EDUFUNHUB_KEYSTORE_PASSWORD="$(cat "$PASSWORD_FILE")" \
        -e EDUFUNHUB_KEY_ALIAS="$KEY_ALIAS" \
        "$IMAGE" "$@"
}

fingerprint() {
    ensure_image
    run_builder bash -c 'keytool -list -v -keystore /secrets/edufunhub-upload.keystore -alias "$EDUFUNHUB_KEY_ALIAS" -storepass "$EDUFUNHUB_KEYSTORE_PASSWORD"' \
        | awk '/SHA256:/ {print $2}'
}

create_keystore() {
    if [ -f "$KEYSTORE" ]; then
        echo "Upload key already exists: $KEYSTORE (refusing to overwrite)" >&2
        exit 1
    fi
    ensure_image
    install -d -m 700 "$SECRETS_DIR"
    (umask 077 && head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32 > "$PASSWORD_FILE")
    docker run --rm \
        -v "$SECRETS_DIR":/secrets \
        -e PASS="$(cat "$PASSWORD_FILE")" \
        "$IMAGE" keytool -genkeypair -v -keystore /secrets/edufunhub-upload.keystore \
        -alias "$KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
        -storepass:env PASS -keypass:env PASS \
        -dname "CN=EduFunHub, OU=Mobile, O=EduFunHub, L=Bogor, ST=Jawa Barat, C=ID"
    chmod 600 "$KEYSTORE" "$PASSWORD_FILE"
    echo "Upload key SHA-256: $(fingerprint)"
}

build() {
    [ -f "$KEYSTORE" ] || { echo "Missing upload key, run: $0 keystore" >&2; exit 1; }
    ensure_image
    run_builder bash -c 'chmod +x ./gradlew && ./gradlew --no-daemon -q bundleRelease assembleRelease'
    mkdir -p "$ANDROID_DIR/dist"
    cp "$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab" "$ANDROID_DIR/dist/edufunhub.aab"
    cp "$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk" "$ANDROID_DIR/dist/edufunhub.apk"
    ls -l "$ANDROID_DIR/dist"
    sha256sum "$ANDROID_DIR/dist/"*
}

case "${1:-build}" in
    keystore) create_keystore ;;
    fingerprint) fingerprint ;;
    build) build ;;
    *) echo "Usage: $0 [build|keystore|fingerprint]" >&2; exit 1 ;;
esac
