#![doc = "Binary used by cargo-odra to build Casper WASM."]
#![no_std]
#![cfg_attr(target_arch = "wasm32", no_main)]
#![allow(unused_imports, clippy::single_component_path_imports)]

use build_dossier_registry;

#[cfg(not(target_arch = "wasm32"))]
fn main() {}
