pub mod catalog_lifecycle;
pub mod contract;
pub mod fingerprint;
pub mod identity;
pub mod lifecycle;
pub mod path;
pub mod processor;
pub mod publication;
pub mod recovery;
pub mod schema;

#[cfg(test)]
mod catalog_lifecycle_tests;
#[cfg(test)]
mod lifecycle_tests;
#[cfg(test)]
mod processor_tests;
#[cfg(test)]
mod publication_tests;
