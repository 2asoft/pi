set shell := ["bash", "-euo", "pipefail", "-c"]

platform := `node -p "process.platform.replace('win32', 'windows') + '-' + process.arch"`

prep:
    npm ci --ignore-scripts

build: prep
    ./scripts/build-binaries.sh --skip-install --platform "{{ platform }}"

# Build and install the host release with: just install
install: build
    rm -rf "${HOME:?}/.bin/pi"
    mkdir -p "${HOME:?}/.bin/pi"
    cp -a "packages/coding-agent/binaries/{{ platform }}/." "${HOME:?}/.bin/pi/"

reporeset:
    git checkout -- packages/ai/src/image-models.generated.ts packages/ai/src/providers/*models*
