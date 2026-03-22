set shell := ["bash", "-euo", "pipefail", "-c"]

prep:
    npm install
    cd packages/coding-agent && npm install

build:
    cd packages/coding-agent && npm run build:binary

install: prep build
    rm -rf "${HOME:?}/.bin/pi"
    mkdir -p "${HOME:?}/.bin/pi"
    cp -a packages/coding-agent/dist/. "${HOME:?}/.bin/pi/"

reporeset:
    git checkout -- packages/ai/src/image-models.generated.ts packages/ai/src/providers/*models*
