use rusqlite::Connection;

use super::{
    identity::OperationIdentity,
    path::ManagedMediaRoot,
    processor::ManagedMediaProcessor,
    publication::{list_nonterminal_operations, recover_one, PublicationError, RecoveryOutcome},
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

pub fn recover(
    connection: &Connection,
    root: &ManagedMediaRoot,
    processor: &ManagedMediaProcessor,
    scope: RecoveryScope,
) -> Result<Vec<OperationRecoveryOutcome>, PublicationError> {
    let operation_ids = match scope {
        RecoveryScope::Operation(operation) => vec![operation.as_str().to_string()],
        RecoveryScope::BoundedNonterminal { maximum_operations } => {
            list_nonterminal_operations(connection, maximum_operations)?
        }
    };
    operation_ids
        .into_iter()
        .map(|operation_id| {
            let outcome = recover_one(connection, root, processor, &operation_id)?;
            Ok(OperationRecoveryOutcome {
                operation_id,
                outcome,
            })
        })
        .collect()
}
