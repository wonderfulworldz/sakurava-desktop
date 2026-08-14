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
    removal::{is_removal_operation, recover_removal_operation},
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
    let operation_ids = match scope {
        RecoveryScope::Operation(operation) => vec![operation.as_str().to_string()],
        RecoveryScope::BoundedNonterminal { maximum_operations } => {
            list_nonterminal_operations(connection, maximum_operations)
                .map_err(RecoveryError::boundary)?
        }
    };
    operation_ids
        .into_iter()
        .map(|operation_id| {
            if is_removal_operation(connection, &operation_id)
                .map_err(|error| RecoveryError::operation(&operation_id, error))?
            {
                let outcome = recover_removal_operation(connection, root, &operation_id)
                    .map_err(|error| RecoveryError::operation(&operation_id, error))?;
                return Ok(OperationRecoveryOutcome {
                    operation_id,
                    outcome,
                });
            }
            let plan = prepare_recovery(connection, &operation_id)
                .map_err(|error| RecoveryError::operation(&operation_id, error))?;
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
