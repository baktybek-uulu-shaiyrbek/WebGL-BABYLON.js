#!/bin/sh
# Собирает src/*.ts -> js/*.js внутри контейнера.
#   ./build.sh        разовая сборка
#   ./build.sh -w     пересборка при каждом изменении
set -e
cd "$(dirname "$0")"
IMAGE=fractal-build
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker build --quiet -t "$IMAGE" . >/dev/null
docker run --rm -v "$PWD":/app -w /app "$IMAGE" -p tsconfig.json "$@"
echo "js/ собрано из src/"
