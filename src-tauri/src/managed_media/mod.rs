pub mod acquisition;
pub mod catalog_lifecycle;
pub mod contract;
pub mod descriptors;
pub mod executor;
pub mod fingerprint;
pub mod identity;
pub mod lifecycle;
pub mod path;
pub mod processor;
pub mod production;
pub mod publication;
pub mod recovery;
pub mod removal;
pub mod runtime;
pub mod schema;
pub mod status;

#[cfg(test)]
mod acquisition_tests;
#[cfg(test)]
mod catalog_lifecycle_tests;
#[cfg(test)]
mod descriptors_tests;
#[cfg(test)]
mod executor_tests;
#[cfg(test)]
mod lifecycle_tests;
#[cfg(test)]
mod processor_tests;
#[cfg(test)]
mod production_tests;
#[cfg(test)]
mod publication_tests;
#[cfg(test)]
mod removal_tests;
#[cfg(test)]
mod runtime_tests;
#[cfg(test)]
mod status_tests;
