use std::fmt;

use rusqlite::Connection;

use super::{
    identity::OperationIdentity,
    path::ManagedMediaRoot,
    processor::ManagedMediaProcessor,
    publication::{
        apply_recovery, cleanup_recovery, inspect_recovery_filesystem, list_nonterminal_operations,
        prepare_recovery, PublicationError, RecoveryOutcome,
    },
};

#[derive(Debug, Clone)]
pub enum RecoveryScope {
    Operation(OperationIdentity),
    BoundedNonterminal { maximum_operations: u32 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperationRecoveryOutcome {
    pub operation_id: String,
    pub outcome: RecoveryOutcome,
}

#[derive(Debug)]
pub struct RecoveryError {
    pub operation_id: Option<String>,
    pub source: PublicationError,
}

impl RecoveryError {
    fn operation(operation_id: impl Into<String>, source: PublicationError) -> Self {
        Self {
            operation_id: Some(operation_id.into()),
            source,
        }
    }

    fn boundary(source: PublicationError) -> Self {
        Self {
            operation_id: None,
            source,
        }
    }
}

impl fmt::Display for RecoveryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.operation_id.as_deref() {
            Some(operation_id) => write!(formatter, "operation {operation_id}: {}", self.source),
            None => write!(formatter, "{}", self.source),
        }
    }
}

impl std::error::Error for RecoveryError {}

pub fn recover(
    connection: &Connection,
    root: &ManagedMediaRoot,
    processor: &ManagedMediaProcessor,
    scope: RecoveryScope,
) -> Result<Vec<OperationRecoveryOutcome>, RecoveryError> {
    let plans = match scope {
        RecoveryScope::Operation(operation) => {
            vec![prepare_recovery(connection, operation.as_str())
                .map_err(|error| RecoveryError::operation(operation.as_str(), error))?]
        }
        RecoveryScope::BoundedNonterminal { maximum_operations } => {
            list_nonterminal_operations(connection, maximum_operations)
                .map_err(RecoveryError::boundary)?
                .into_iter()
                .map(|operation_id| {
                    prepare_recovery(connection, &operation_id)
                        .map_err(|error| RecoveryError::operation(operation_id, error))
                })
                .collect::<Result<Vec<_>, _>>()?
        }
    };
    plans
        .into_iter()
        .map(|plan| {
            let operation_id = plan.operation_id().to_string();
            let evidence = inspect_recovery_filesystem(root, processor, &plan)
                .map_err(|error| RecoveryError::operation(&operation_id, error))?;
            let outcome = apply_recovery(connection, &plan, evidence)
                .map_err(|error| RecoveryError::operation(&operation_id, error))?;
            cleanup_recovery(root, processor, &plan, evidence)
                .map_err(|error| RecoveryError::operation(&operation_id, error))?;
            Ok(OperationRecoveryOutcome {
                operation_id,
                outcome,
            })
        })
        .collect()
}
