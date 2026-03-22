set shell := ["bash", "-euo", "pipefail", "-c"]

platform := `node -p "process.platform.replace('win32', 'windows') + '-' + process.arch"`

prep:
    npm ci --ignore-scripts

build: prep
    ./scripts/build-binaries.sh --skip-install --platform "{{ platform }}"

# Install the previously built and behaviorally verified host release.
install:
    #!/usr/bin/env bash
    set -euo pipefail
    source="packages/coding-agent/binaries/{{ platform }}"
    target="${HOME:?}/.bin/pi"
    test -x "$source/pi"
    mkdir -p "${HOME}/.bin"
    stage="$(mktemp -d "${HOME}/.bin/pi-stage.XXXXXX")"
    cp -a "$source/." "$stage/"
    if [ -e "$target" ]; then
        backup="$(mktemp -d "${HOME}/.bin/pi-backup.XXXXXX")"
        rmdir "$backup"
        mv "$target" "$backup"
        printf 'Previous installation: %s\n' "$backup"
    fi
    mv "$stage" "$target"
