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

pub fn recover(
    connection: &Connection,
    root: &ManagedMediaRoot,
    processor: &ManagedMediaProcessor,
    scope: RecoveryScope,
) -> Result<Vec<OperationRecoveryOutcome>, PublicationError> {
    let plans = match scope {
        RecoveryScope::Operation(operation) => {
            vec![prepare_recovery(connection, operation.as_str())?]
        }
        RecoveryScope::BoundedNonterminal { maximum_operations } => {
            list_nonterminal_operations(connection, maximum_operations)?
                .into_iter()
                .map(|operation_id| prepare_recovery(connection, &operation_id))
                .collect::<Result<Vec<_>, _>>()?
        }
    };
    plans
        .into_iter()
        .map(|plan| {
            let operation_id = plan.operation_id().to_string();
            let evidence = inspect_recovery_filesystem(root, processor, &plan)?;
            let outcome = apply_recovery(connection, &plan, evidence)?;
            cleanup_recovery(root, processor, &plan, evidence)?;
            Ok(OperationRecoveryOutcome {
                operation_id,
                outcome,
            })
        })
        .collect()
}
