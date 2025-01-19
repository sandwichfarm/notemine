#!/bin/bash

AUTO_CONFIRM=false
if [ "$CI_ENV" == "true" ]; then
    AUTO_CONFIRM=true
fi
for arg in "$@"; do
    if [ "$arg" == "-y" ]; then
        AUTO_CONFIRM=true
        break
    fi
done

function is_installed() {
    command -v "$1" &> /dev/null
}

function confirm_installation() {
    if [ "$AUTO_CONFIRM" == true ]; then
        return 0
    fi
    read -p "$1 (y/n): " choice
    case "$choice" in
        y|Y ) return 0;;
        n|N ) return 1;;
        * ) echo "Please enter y or n."; confirm_installation "$1";;
    esac
}

if is_installed cargo; then
    echo "Cargo is already installed."
else
    if confirm_installation "Cargo is not installed. Do you want to install Rust and Cargo?"; then
        echo "Installing Rust and Cargo..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
        echo "Cargo has been installed."
    else
        echo "Skipping Cargo installation."
    fi
fi

if is_installed wasm-pack; then
    echo "wasm-pack is already installed."
else
    if confirm_installation "wasm-pack is not installed. Do you want to install wasm-pack?"; then
        echo "Installing wasm-pack..."
        cargo install wasm-pack
        echo "wasm-pack has been installed."
    else
        echo "Skipping wasm-pack installation."
    fi
fi

