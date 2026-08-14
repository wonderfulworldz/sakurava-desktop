use std::{
    cell::Cell,
    fs,
    io::Cursor,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use image::{
    codecs::{
        gif::{GifEncoder, Repeat},
        jpeg::JpegEncoder,
        png::PngEncoder,
        webp::WebPEncoder,
    },
    Delay, DynamicImage, ExtendedColorType, Frame, ImageEncoder, Rgba, RgbaImage,
};
use rusqlite::Connection;

use super::acquisition::{
    acquire_local_source, validate_local_source_readable, AcquisitionCheckpoint, AcquisitionError,
    AcquisitionPolicy, FailureDisposition, LocalGenerationOrchestrator, OrchestrationCheckpoint,
    OrchestrationFailure,
};
use super::{
    catalog_lifecycle::{locator_hash, reconcile_owner_mutation, OwnerSources},
    fingerprint::fingerprint_reader,
    identity::{LifecycleClaimToken, LifecycleIntentIdentity},
    lifecycle::{claim_intent, ClaimedIntentSnapshot, ExecutorTimestamp, LifecycleState},
    path::ManagedMediaRoot,
    processor::ManagedMediaProcessor,
    schema,
};

fn temporary_root(label: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!(
        "sakurava-managed-media-{label}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    fs::create_dir_all(&root).expect("temporary root");
    root
}

struct OrchestrationEnvironment {
    base: PathBuf,
    database_path: PathBuf,
    connection: Option<Connection>,
    root: ManagedMediaRoot,
    processor: ManagedMediaProcessor,
    owner: OwnerSources,
    source_path: PathBuf,
}

impl OrchestrationEnvironment {
    fn new(name: &str, width: u32, height: u32) -> Self {
        Self::new_with_owner(name, width, height, |owner_id, source| {
            OwnerSources::glossary(owner_id, source)
        })
    }

    fn new_category(name: &str, width: u32, height: u32) -> Self {
        Self::new_with_owner(name, width, height, |owner_id, source| {
            OwnerSources::category(owner_id, source)
        })
    }

    fn new_with_owner(
        name: &str,
        width: u32,
        height: u32,
        owner_factory: impl FnOnce(String, String) -> OwnerSources,
    ) -> Self {
        let base = temporary_root(&format!("orchestration-{name}"));
        let source_root = base.join("sources");
        fs::create_dir_all(&source_root).expect("source root");
        let source_path = source_root.join("source.png");
        fs::write(&source_path, synthetic_png(width, height, 0x44)).expect("source");
        let database_path = base.join("orchestration.sqlite");
        let mut connection = Connection::open(&database_path).expect("database");
        schema::initialize_schema(&connection).expect("schema");
        let owner = owner_factory(
            format!("glossary-{name}"),
            source_path.to_string_lossy().to_string(),
        );
        let transaction = connection.transaction().expect("transaction");
        reconcile_owner_mutation(
            &transaction,
            None,
            Some(&owner),
            &mut || Err("no repeated token expected".to_string()),
            "1",
        )
        .expect("lifecycle reconciliation");
        transaction.commit().expect("commit");
        let root = ManagedMediaRoot::from_app_data_dir(&base).expect("managed root");
        Self {
            base,
            database_path,
            connection: Some(connection),
            root,
            processor: ManagedMediaProcessor::default(),
            owner,
            source_path,
        }
    }

    fn connection(&self) -> &Connection {
        self.connection.as_ref().expect("connection")
    }

    fn claim(&self, token: &str, now: u64, expires_at: u64) -> ClaimedIntentSnapshot {
        let intent_id: String = self
            .connection()
            .query_row(
                "SELECT intent_id FROM managed_media_lifecycle_intents
                 ORDER BY desired_revision DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .expect("intent");
        match claim_intent(
            self.connection(),
            &LifecycleIntentIdentity::new(intent_id).expect("intent identity"),
            &LifecycleClaimToken::new(token).expect("claim token"),
            &ExecutorTimestamp::from_millis(now).expect("now"),
            &ExecutorTimestamp::from_millis(expires_at).expect("expiry"),
        )
        .expect("claim")
        {
            super::lifecycle::ClaimAttemptOutcome::Claimed(claimed) => claimed,
            other => panic!("unexpected claim outcome: {other:?}"),
        }
    }

    fn policy(&self) -> AcquisitionPolicy {
        AcquisitionPolicy::new(
            16 * 1024 * 1024,
            1024,
            vec![self
                .source_path
                .parent()
                .expect("source parent")
                .to_path_buf()],
        )
        .expect("acquisition policy")
    }

    fn target_states(&self) -> Vec<String> {
        let mut statement = self
            .connection()
            .prepare(
                "SELECT target_state FROM managed_media_lifecycle_targets
                 ORDER BY variant_class, standard_tier",
            )
            .expect("target states");
        statement
            .query_map([], |row| row.get(0))
            .expect("query")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("states")
    }

    fn intent_state(&self) -> String {
        self.connection()
            .query_row(
                "SELECT lifecycle_state FROM managed_media_lifecycle_intents
                 ORDER BY desired_revision DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .expect("intent state")
    }
}

impl Drop for OrchestrationEnvironment {
    fn drop(&mut self) {
        self.connection.take();
        fs::remove_dir_all(&self.base).expect("temporary cleanup");
    }
}

fn synthetic_png(width: u32, height: u32, seed: u8) -> Vec<u8> {
    let pixels = synthetic_pixels(width, height, seed, false);
    let mut output = Vec::new();
    PngEncoder::new(&mut output)
        .write_image(pixels.as_raw(), width, height, ExtendedColorType::Rgba8)
        .expect("png");
    output
}

fn synthetic_pixels(width: u32, height: u32, seed: u8, alpha: bool) -> RgbaImage {
    RgbaImage::from_fn(width, height, |x, y| {
        Rgba([
            seed.wrapping_add((x % 251) as u8),
            seed.wrapping_add((y % 241) as u8),
            seed,
            if alpha && (x + y) % 7 == 0 { 96 } else { 255 },
        ])
    })
}

fn synthetic_jpeg(width: u32, height: u32) -> Vec<u8> {
    let image = DynamicImage::ImageRgba8(synthetic_pixels(width, height, 0x31, false)).to_rgb8();
    let mut output = Vec::new();
    JpegEncoder::new_with_quality(&mut output, 92)
        .encode(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgb8,
        )
        .expect("jpeg");
    output
}

fn synthetic_webp(width: u32, height: u32) -> Vec<u8> {
    let image = synthetic_pixels(width, height, 0x42, true);
    let mut output = Vec::new();
    WebPEncoder::new_lossless(&mut output)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )
        .expect("webp");
    output
}

fn synthetic_animated_gif(width: u32, height: u32) -> Vec<u8> {
    let first = synthetic_pixels(width, height, 0x53, false);
    let second = synthetic_pixels(width, height, 0x64, false);
    let mut output = Vec::new();
    {
        let mut encoder = GifEncoder::new(&mut output);
        encoder.set_repeat(Repeat::Infinite).expect("repeat");
        for image in [first, second] {
            encoder
                .encode_frame(Frame::from_parts(
                    image,
                    0,
                    0,
                    Delay::from_numer_denom_ms(100, 1),
                ))
                .expect("gif frame");
        }
    }
    output
}

fn owner_provider(
    owner: OwnerSources,
) -> impl FnMut(super::identity::OwnerKind, &str) -> Result<Option<OwnerSources>, String> {
    move |kind, id| Ok((owner.owner_kind == kind && owner.owner_id == id).then(|| owner.clone()))
}

#[test]
fn bounded_local_acquisition_reads_an_exact_cap_without_mutating_the_source() {
    let root = temporary_root("acquisition-exact-cap");
    let source = root.join("source.bin");
    let bytes = vec![0x5a; 4096];
    fs::write(&source, &bytes).expect("source");
    let policy =
        AcquisitionPolicy::new(bytes.len() as u64, 257, vec![root.clone()]).expect("policy");
    let acquired =
        acquire_local_source(&source, &policy, |_| Ok::<_, ()>(())).expect("acquisition");
    assert_eq!(acquired.bytes, bytes);
    assert_eq!(fs::read(&source).expect("unchanged source"), bytes);
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn validate_local_source_readable_accepts_unchanged_file_and_rejects_directory() {
    let root = temporary_root("validate-local-source-readable");
    let source = root.join("source.bin");
    let bytes = b"readable source".to_vec();
    fs::write(&source, &bytes).expect("source");

    assert_eq!(
        validate_local_source_readable(&source).expect("readable source"),
        bytes.len() as u64
    );
    assert_eq!(fs::read(&source).expect("unchanged source"), bytes);
    assert!(validate_local_source_readable(&root).is_err());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn acquisition_policy_and_byte_cap_fail_closed() {
    let root = temporary_root("acquisition-policy");
    assert!(AcquisitionPolicy::new(0, 1, vec![root.clone()]).is_err());
    assert!(AcquisitionPolicy::new(1, 0, vec![root.clone()]).is_err());
    assert!(AcquisitionPolicy::new(1, 1, Vec::new()).is_err());

    let source = root.join("too-large.bin");
    fs::write(&source, [1_u8, 2, 3]).expect("source");
    let policy = AcquisitionPolicy::new(2, 1, vec![root.clone()]).expect("policy");
    assert!(matches!(
        acquire_local_source(&source, &policy, |_| Ok::<_, ()>(())),
        Err(AcquisitionError::SourceTooLarge { limit: 2 })
    ));
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn missing_directory_and_outside_root_sources_are_rejected() {
    let root = temporary_root("acquisition-rejections");
    let other = temporary_root("acquisition-outside");
    let policy = AcquisitionPolicy::new(1024, 64, vec![root.clone()]).expect("policy");

    assert!(matches!(
        acquire_local_source(&root.join("missing.bin"), &policy, |_| Ok::<_, ()>(())),
        Err(AcquisitionError::MissingFile)
    ));
    assert!(matches!(
        acquire_local_source(&root, &policy, |_| Ok::<_, ()>(())),
        Err(AcquisitionError::Directory)
    ));
    let outside = other.join("outside.bin");
    fs::write(&outside, b"outside").expect("outside source");
    assert!(matches!(
        acquire_local_source(&outside, &policy, |_| Ok::<_, ()>(())),
        Err(AcquisitionError::PathOutsideAllowedRoots)
    ));

    fs::remove_dir_all(root).expect("cleanup");
    fs::remove_dir_all(other).expect("cleanup");
}

#[test]
fn cancellation_is_checked_between_bounded_read_chunks() {
    let root = temporary_root("acquisition-cancellation");
    let source = root.join("source.bin");
    fs::write(&source, vec![0x41; 4096]).expect("source");
    let policy = AcquisitionPolicy::new(4096, 256, vec![root.clone()]).expect("policy");
    let result = acquire_local_source(&source, &policy, |checkpoint| {
        if checkpoint
            == (AcquisitionCheckpoint::BetweenReadChunks {
                completed_chunks: 2,
            })
        {
            Err("cancelled")
        } else {
            Ok(())
        }
    });
    assert!(matches!(
        result,
        Err(AcquisitionError::Control("cancelled"))
    ));
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn source_replacement_or_truncation_during_read_is_detected_when_supported() {
    let root = temporary_root("acquisition-mutation");
    let source = root.join("source.bin");
    fs::write(&source, vec![0x51; 4096]).expect("source");
    let policy = AcquisitionPolicy::new(4096, 256, vec![root.clone()]).expect("policy");
    let mutation_succeeded = Cell::new(false);
    let result = acquire_local_source(&source, &policy, |checkpoint| {
        if checkpoint
            == (AcquisitionCheckpoint::BetweenReadChunks {
                completed_chunks: 1,
            })
            && fs::write(&source, vec![0x52; 128]).is_ok()
        {
            mutation_succeeded.set(true);
        }
        Ok::<_, ()>(())
    });
    if mutation_succeeded.get() {
        assert!(matches!(
            result,
            Err(AcquisitionError::SourceChangedDuringRead)
        ));
    }
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn symbolic_link_sources_are_rejected_when_the_platform_can_create_them() {
    let root = temporary_root("acquisition-symlink");
    let source = root.join("source.bin");
    let link = root.join("link.bin");
    fs::write(&source, b"source").expect("source");

    #[cfg(windows)]
    let link_result = std::os::windows::fs::symlink_file(&source, &link);
    #[cfg(unix)]
    let link_result = std::os::unix::fs::symlink(&source, &link);
    #[cfg(not(any(windows, unix)))]
    let link_result: std::io::Result<()> = Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "unsupported",
    ));

    if link_result.is_ok() {
        let policy = AcquisitionPolicy::new(1024, 64, vec![root.clone()]).expect("policy");
        assert!(matches!(
            acquire_local_source(&link, &policy, |_| Ok::<_, ()>(())),
            Err(AcquisitionError::SymlinkOrReparsePoint)
        ));
    }
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn local_source_orchestration_publishes_standard_output_and_finalizes_atomically() {
    let environment = OrchestrationEnvironment::new("standard", 640, 640);
    let original = fs::read(&environment.source_path).expect("original");
    let claimed = environment.claim("standard-claim", 2, 10_000);
    let policy = environment.policy();
    let mut provider = owner_provider(environment.owner.clone());
    let mut failure_policy = |_failure| FailureDisposition::Terminal;
    let mut clock = || Ok(10_u64);
    let mut cancellation = |_point| Ok(false);
    let report = LocalGenerationOrchestrator::new(
        environment.connection(),
        &mut provider,
        &environment.root,
        &environment.processor,
        &policy,
        &mut failure_policy,
        &mut clock,
        &mut cancellation,
    )
    .execute(&claimed)
    .expect("orchestration");

    assert!(report.source_resolved);
    assert!(report.source_acquired);
    assert!(report.source_fingerprinted);
    assert_eq!(report.orchestration_fingerprints_calculated, 1);
    assert_eq!(report.standard_targets_published, 1);
    assert_eq!(report.fallback_targets_published, 0);
    assert_eq!(report.targets_skipped_ineligible, 1);
    assert!(report.finalized);
    assert_eq!(
        environment.intent_state(),
        LifecycleState::Completed.as_str()
    );
    assert_eq!(
        environment.target_states(),
        vec!["skipped_ineligible", "published"]
    );
    assert_eq!(
        environment
            .connection()
            .query_row(
                "SELECT current_revision FROM managed_media_item_generations",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("revision"),
        1
    );
    assert_eq!(
        fs::read(&environment.source_path).expect("source"),
        original
    );
}

#[test]
fn processor_orchestration_accepts_jpeg_png_gif_first_frame_and_static_webp() {
    let fixtures = vec![
        ("jpeg", synthetic_jpeg(640, 640)),
        ("png-alpha", {
            let image = synthetic_pixels(640, 640, 0x22, true);
            let mut output = Vec::new();
            PngEncoder::new(&mut output)
                .write_image(
                    image.as_raw(),
                    image.width(),
                    image.height(),
                    ExtendedColorType::Rgba8,
                )
                .expect("alpha png");
            output
        }),
        ("gif", synthetic_animated_gif(640, 640)),
        ("webp", synthetic_webp(640, 640)),
    ];

    for (label, bytes) in fixtures {
        let environment = OrchestrationEnvironment::new(label, 640, 640);
        fs::write(&environment.source_path, bytes).expect("replace source fixture");
        let claimed = environment.claim(&format!("{label}-claim"), 2, 10_000);
        let policy = environment.policy();
        let mut provider = owner_provider(environment.owner.clone());
        let mut failure_policy = |_failure| FailureDisposition::Terminal;
        let mut clock = || Ok(10_u64);
        let mut cancellation = |_point| Ok(false);
        let report = LocalGenerationOrchestrator::new(
            environment.connection(),
            &mut provider,
            &environment.root,
            &environment.processor,
            &policy,
            &mut failure_policy,
            &mut clock,
            &mut cancellation,
        )
        .execute(&claimed)
        .expect("format orchestration");
        assert!(report.finalized, "{label}");
        assert_eq!(report.standard_targets_published, 1, "{label}");
    }
}

#[test]
fn content_fingerprint_is_stable_across_a_local_path_rename() {
    let root = temporary_root("fingerprint-rename");
    let first_path = root.join("first.bin");
    let second_path = root.join("second.bin");
    let bytes = b"same-content-after-rename";
    fs::write(&first_path, bytes).expect("first source");
    let policy = AcquisitionPolicy::new(1024, 7, vec![root.clone()]).expect("policy");
    let first =
        acquire_local_source(&first_path, &policy, |_| Ok::<_, ()>(())).expect("first read");
    fs::rename(&first_path, &second_path).expect("rename");
    let second =
        acquire_local_source(&second_path, &policy, |_| Ok::<_, ()>(())).expect("second read");
    let first_fingerprint =
        fingerprint_reader(Cursor::new(first.bytes), 1024).expect("first fingerprint");
    let second_fingerprint =
        fingerprint_reader(Cursor::new(second.bytes), 1024).expect("second fingerprint");
    assert_eq!(first_fingerprint.hash, second_fingerprint.hash);
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn native_fallback_is_published_only_under_the_fallback_target() {
    let environment = OrchestrationEnvironment::new("fallback", 100, 100);
    let claimed = environment.claim("fallback-claim", 2, 10_000);
    let policy = environment.policy();
    let mut provider = owner_provider(environment.owner.clone());
    let mut failure_policy = |_failure| FailureDisposition::Terminal;
    let mut clock = || Ok(10_u64);
    let mut cancellation = |_point| Ok(false);
    let report = LocalGenerationOrchestrator::new(
        environment.connection(),
        &mut provider,
        &environment.root,
        &environment.processor,
        &policy,
        &mut failure_policy,
        &mut clock,
        &mut cancellation,
    )
    .execute(&claimed)
    .expect("orchestration");

    assert_eq!(report.standard_targets_published, 0);
    assert_eq!(report.fallback_targets_published, 1);
    assert_eq!(report.targets_skipped_ineligible, 1);
    assert!(report.finalized);
    let classes: Vec<(String, Option<String>)> = {
        let mut statement = environment
            .connection()
            .prepare(
                "SELECT variant_class, standard_tier
                 FROM managed_media_variants ORDER BY variant_class",
            )
            .expect("variants");
        statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .expect("query")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("classes")
    };
    assert_eq!(classes, vec![("native_fallback".to_string(), None)]);
}

#[test]
fn larger_standard_targets_are_independently_skipped_without_blocking_finalization() {
    let environment = OrchestrationEnvironment::new_category("partial-tiers", 640, 640);
    let claimed = environment.claim("partial-tier-claim", 2, 10_000);
    let policy = environment.policy();
    let mut provider = owner_provider(environment.owner.clone());
    let mut failure_policy = |_failure| FailureDisposition::Terminal;
    let mut clock = || Ok(10_u64);
    let mut cancellation = |_point| Ok(false);
    let report = LocalGenerationOrchestrator::new(
        environment.connection(),
        &mut provider,
        &environment.root,
        &environment.processor,
        &policy,
        &mut failure_policy,
        &mut clock,
        &mut cancellation,
    )
    .execute(&claimed)
    .expect("orchestration");

    assert_eq!(report.standard_targets_published, 2);
    assert_eq!(report.fallback_targets_published, 0);
    assert_eq!(report.targets_skipped_ineligible, 3);
    assert!(report.finalized);
    assert_eq!(environment.intent_state(), "completed");
}

#[test]
fn missing_source_uses_only_the_injected_retry_or_terminal_policy() {
    let retry_environment = OrchestrationEnvironment::new("missing-retry", 640, 640);
    let retry_claim = retry_environment.claim("retry-claim", 2, 10_000);
    fs::remove_file(&retry_environment.source_path).expect("remove source");
    let retry_policy = retry_environment.policy();
    let mut retry_provider = owner_provider(retry_environment.owner.clone());
    let mut failure_policy = |failure| {
        assert_eq!(failure, OrchestrationFailure::MissingLocalFile);
        FailureDisposition::RetryAt(ExecutorTimestamp::from_millis(100).expect("retry at"))
    };
    let mut clock = || Ok(10_u64);
    let mut cancellation = |_point| Ok(false);
    let retry_report = LocalGenerationOrchestrator::new(
        retry_environment.connection(),
        &mut retry_provider,
        &retry_environment.root,
        &retry_environment.processor,
        &retry_policy,
        &mut failure_policy,
        &mut clock,
        &mut cancellation,
    )
    .execute(&retry_claim)
    .expect("retry orchestration");
    assert!(retry_report.retry_scheduled);
    assert_eq!(retry_environment.intent_state(), "retry_wait");
    assert!(retry_environment
        .target_states()
        .iter()
        .all(|state| state == "retryable_failure"));

    let terminal_environment = OrchestrationEnvironment::new("missing-terminal", 640, 640);
    let terminal_claim = terminal_environment.claim("terminal-claim", 2, 10_000);
    fs::remove_file(&terminal_environment.source_path).expect("remove source");
    let terminal_policy = terminal_environment.policy();
    let mut terminal_provider = owner_provider(terminal_environment.owner.clone());
    let mut failure_policy = |failure| {
        assert_eq!(failure, OrchestrationFailure::MissingLocalFile);
        FailureDisposition::Terminal
    };
    let mut clock = || Ok(10_u64);
    let mut cancellation = |_point| Ok(false);
    let terminal_report = LocalGenerationOrchestrator::new(
        terminal_environment.connection(),
        &mut terminal_provider,
        &terminal_environment.root,
        &terminal_environment.processor,
        &terminal_policy,
        &mut failure_policy,
        &mut clock,
        &mut cancellation,
    )
    .execute(&terminal_claim)
    .expect("terminal orchestration");
    assert_eq!(
        terminal_report.terminal_failure,
        Some(OrchestrationFailure::MissingLocalFile)
    );
    assert_eq!(terminal_environment.intent_state(), "failed");
    assert!(terminal_environment
        .target_states()
        .iter()
        .all(|state| state == "terminal_failure"));

    let recovery_environment = OrchestrationEnvironment::new("missing-recovery", 640, 640);
    let recovery_claim = recovery_environment.claim("recovery-claim", 2, 10_000);
    fs::remove_file(&recovery_environment.source_path).expect("remove source");
    let recovery_policy = recovery_environment.policy();
    let mut recovery_provider = owner_provider(recovery_environment.owner.clone());
    let mut failure_policy = |failure| {
        assert_eq!(failure, OrchestrationFailure::MissingLocalFile);
        FailureDisposition::RecoveryRequired
    };
    let mut clock = || Ok(10_u64);
    let mut cancellation = |_point| Ok(false);
    let recovery_report = LocalGenerationOrchestrator::new(
        recovery_environment.connection(),
        &mut recovery_provider,
        &recovery_environment.root,
        &recovery_environment.processor,
        &recovery_policy,
        &mut failure_policy,
        &mut clock,
        &mut cancellation,
    )
    .execute(&recovery_claim)
    .expect("recovery orchestration");
    assert_eq!(
        recovery_report.terminal_failure,
        Some(OrchestrationFailure::MissingLocalFile)
    );
    assert_eq!(recovery_environment.intent_state(), "recovery_required");
    assert!(recovery_environment
        .target_states()
        .iter()
        .all(|state| state == "recovery_required"));
}

#[test]
fn cancellation_and_source_mutation_preserve_the_last_valid_generation() {
    let cancellation_environment = OrchestrationEnvironment::new("cancel-acquisition", 640, 640);
    let cancellation_claim = cancellation_environment.claim("cancel-claim", 2, 10_000);
    let cancellation_policy = AcquisitionPolicy::new(
        16 * 1024 * 1024,
        64,
        vec![cancellation_environment
            .source_path
            .parent()
            .expect("source parent")
            .to_path_buf()],
    )
    .expect("policy");
    let mut provider = owner_provider(cancellation_environment.owner.clone());
    let mut failure_policy = |_failure| FailureDisposition::Terminal;
    let mut clock = || Ok(10_u64);
    let mut cancellation = |point| {
        Ok(matches!(
            point,
            OrchestrationCheckpoint::Acquisition(AcquisitionCheckpoint::BetweenReadChunks {
                completed_chunks: 1
            })
        ))
    };
    let cancelled = LocalGenerationOrchestrator::new(
        cancellation_environment.connection(),
        &mut provider,
        &cancellation_environment.root,
        &cancellation_environment.processor,
        &cancellation_policy,
        &mut failure_policy,
        &mut clock,
        &mut cancellation,
    )
    .execute(&cancellation_claim)
    .expect("cancelled orchestration");
    assert!(cancelled.cancelled);
    assert_eq!(cancellation_environment.intent_state(), "cancelled");
    assert_eq!(
        cancellation_environment
            .connection()
            .query_row(
                "SELECT current_revision FROM managed_media_item_generations",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("current revision"),
        0
    );

    let mutation_environment = OrchestrationEnvironment::new("mutated-source", 640, 640);
    let mutation_claim = mutation_environment.claim("mutation-claim", 2, 10_000);
    let mutation_policy = AcquisitionPolicy::new(
        16 * 1024 * 1024,
        64,
        vec![mutation_environment
            .source_path
            .parent()
            .expect("source parent")
            .to_path_buf()],
    )
    .expect("policy");
    let mut provider = owner_provider(mutation_environment.owner.clone());
    let mut failure_policy = |_failure| FailureDisposition::Terminal;
    let mut clock = || Ok(10_u64);
    let mutated = Cell::new(false);
    let mut cancellation = |point| {
        if !mutated.get()
            && matches!(
                point,
                OrchestrationCheckpoint::Acquisition(AcquisitionCheckpoint::BetweenReadChunks {
                    completed_chunks: 1
                })
            )
        {
            fs::write(
                &mutation_environment.source_path,
                synthetic_png(64, 64, 0x55),
            )
            .expect("mutate source");
            mutated.set(true);
        }
        Ok(false)
    };
    let mutation_report = LocalGenerationOrchestrator::new(
        mutation_environment.connection(),
        &mut provider,
        &mutation_environment.root,
        &mutation_environment.processor,
        &mutation_policy,
        &mut failure_policy,
        &mut clock,
        &mut cancellation,
    )
    .execute(&mutation_claim)
    .expect("mutation orchestration");
    assert_eq!(
        mutation_report.terminal_failure,
        Some(OrchestrationFailure::SourceChangedDuringRead)
    );
    assert_eq!(mutation_environment.intent_state(), "failed");
}

#[test]
fn claim_loss_after_filesystem_publication_does_not_activate_a_descriptor() {
    let environment = OrchestrationEnvironment::new("interrupted-linkage", 640, 640);
    let first_claim = environment.claim("first-claim", 2, 100);
    let policy = environment.policy();
    let mut provider = owner_provider(environment.owner.clone());
    let mut failure_policy = |_failure| FailureDisposition::Terminal;
    let mut clock = || Ok(10_u64);
    let replaced = Cell::new(false);
    let database_path = environment.database_path.clone();
    let mut cancellation = |point| {
        if !replaced.get() && matches!(point, OrchestrationCheckpoint::AfterPublication { .. }) {
            let second = Connection::open(&database_path).expect("second connection");
            second
                .execute(
                    "UPDATE managed_media_lifecycle_intents
                     SET claim_token = 'replacement-claim', claim_expires_at = '5'
                     WHERE lifecycle_state = 'claimed'",
                    [],
                )
                .expect("replace claim");
            replaced.set(true);
        }
        Ok(false)
    };
    let first_report = LocalGenerationOrchestrator::new(
        environment.connection(),
        &mut provider,
        &environment.root,
        &environment.processor,
        &policy,
        &mut failure_policy,
        &mut clock,
        &mut cancellation,
    )
    .execute(&first_claim)
    .expect("first orchestration");
    assert!(first_report.lost_ownership);
    assert_eq!(
        environment
            .connection()
            .query_row("SELECT COUNT(*) FROM managed_media_variants", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("variant count"),
        0
    );

    let second_claim = environment.claim("second-claim", 20, 10_000);
    let mut provider = owner_provider(environment.owner.clone());
    let mut failure_policy = |_failure| FailureDisposition::Terminal;
    let mut clock = || Ok(30_u64);
    let mut cancellation = |_point| Ok(false);
    let second_report = LocalGenerationOrchestrator::new(
        environment.connection(),
        &mut provider,
        &environment.root,
        &environment.processor,
        &policy,
        &mut failure_policy,
        &mut clock,
        &mut cancellation,
    )
    .execute(&second_claim)
    .expect("second orchestration");
    assert_eq!(second_report.idempotent_publications_reused, 0);
    assert!(second_report.finalized);
    assert_eq!(
        environment
            .connection()
            .query_row("SELECT COUNT(*) FROM managed_media_variants", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("variant count"),
        1
    );
}

#[test]
fn external_url_locator_is_rejected_without_network_or_source_access() {
    let environment = OrchestrationEnvironment::new("url-rejection", 640, 640);
    let url = "https://example.invalid/source.png";
    let url_hash = locator_hash(super::identity::SourceLocatorKind::ExternalUrl, url)
        .expect("url locator hash");
    environment
        .connection()
        .execute(
            "UPDATE managed_media_items
             SET source_locator_kind = 'external_url', locator_hash = ?1",
            [&url_hash],
        )
        .expect("update item");
    environment
        .connection()
        .execute(
            "UPDATE managed_media_lifecycle_intents SET expected_locator_hash = ?1",
            [&url_hash],
        )
        .expect("update intent");
    let claimed = environment.claim("url-claim", 2, 10_000);
    let mut owner = environment.owner.clone();
    owner.primary_visual = url.to_string();
    let mut provider = owner_provider(owner);
    let policy = environment.policy();
    let mut failure_policy = |failure| {
        assert_eq!(failure, OrchestrationFailure::UnsupportedLocatorKind);
        FailureDisposition::Terminal
    };
    let mut clock = || Ok(10_u64);
    let mut cancellation = |_point| Ok(false);
    let report = LocalGenerationOrchestrator::new(
        environment.connection(),
        &mut provider,
        &environment.root,
        &environment.processor,
        &policy,
        &mut failure_policy,
        &mut clock,
        &mut cancellation,
    )
    .execute(&claimed)
    .expect("URL rejection");
    assert_eq!(
        report.terminal_failure,
        Some(OrchestrationFailure::UnsupportedLocatorKind)
    );
    assert!(!report.source_acquired);
    assert_eq!(environment.intent_state(), "failed");
}
