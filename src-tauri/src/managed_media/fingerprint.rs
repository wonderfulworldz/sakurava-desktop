use std::fmt;
use std::fs::File;
use std::io::{self, Read};
use std::path::Path;

use sha2::{Digest, Sha256};

use super::identity::ValidatedSha256;

pub const HASH_BUFFER_BYTES: usize = 64 * 1024;

#[derive(Debug)]
pub enum FingerprintError {
    UnreadableSource,
    SourceTooLarge { limit: u64 },
    InterruptedRead,
    IoFailure(io::ErrorKind),
    InvalidResult,
}

impl fmt::Display for FingerprintError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnreadableSource => formatter.write_str("Source could not be opened."),
            Self::SourceTooLarge { limit } => {
                write!(formatter, "Source exceeds the {limit}-byte hashing limit.")
            }
            Self::InterruptedRead => formatter.write_str("Source read was interrupted."),
            Self::IoFailure(_) => formatter.write_str("Source could not be read."),
            Self::InvalidResult => formatter.write_str("SHA-256 result was not normalized."),
        }
    }
}

impl std::error::Error for FingerprintError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FingerprintResult {
    pub hash: ValidatedSha256,
    pub byte_length: u64,
}

pub fn fingerprint_file(
    path: &Path,
    maximum_bytes: u64,
) -> Result<FingerprintResult, FingerprintError> {
    let file = File::open(path).map_err(|_| FingerprintError::UnreadableSource)?;
    fingerprint_reader(file, maximum_bytes)
}

pub fn fingerprint_reader<R: Read>(
    mut reader: R,
    maximum_bytes: u64,
) -> Result<FingerprintResult, FingerprintError> {
    let mut hasher = Sha256::new();
    let mut byte_length = 0_u64;
    let mut buffer = [0_u8; HASH_BUFFER_BYTES];

    loop {
        let read = reader.read(&mut buffer).map_err(|error| {
            if error.kind() == io::ErrorKind::Interrupted {
                FingerprintError::InterruptedRead
            } else {
                FingerprintError::IoFailure(error.kind())
            }
        })?;
        if read == 0 {
            break;
        }
        byte_length =
            byte_length
                .checked_add(read as u64)
                .ok_or(FingerprintError::SourceTooLarge {
                    limit: maximum_bytes,
                })?;
        if byte_length > maximum_bytes {
            return Err(FingerprintError::SourceTooLarge {
                limit: maximum_bytes,
            });
        }
        hasher.update(&buffer[..read]);
    }

    let digest = hasher.finalize();
    let mut normalized = String::with_capacity(64);
    for byte in digest {
        use std::fmt::Write as _;
        write!(&mut normalized, "{byte:02x}").map_err(|_| FingerprintError::InvalidResult)?;
    }
    let hash = ValidatedSha256::new(normalized).map_err(|_| FingerprintError::InvalidResult)?;
    Ok(FingerprintResult { hash, byte_length })
}

#[cfg(test)]
mod tests {
    use std::io::{self, Cursor, Read};

    use super::*;

    struct InterruptingReader;

    impl Read for InterruptingReader {
        fn read(&mut self, _buffer: &mut [u8]) -> io::Result<usize> {
            Err(io::Error::new(io::ErrorKind::Interrupted, "synthetic"))
        }
    }

    struct FailingReader;

    impl Read for FailingReader {
        fn read(&mut self, _buffer: &mut [u8]) -> io::Result<usize> {
            Err(io::Error::new(io::ErrorKind::PermissionDenied, "synthetic"))
        }
    }

    #[test]
    fn hashes_known_vectors_and_empty_input() {
        let empty = fingerprint_reader(Cursor::new([]), 0).expect("empty");
        assert_eq!(
            empty.hash.as_str(),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        let abc = fingerprint_reader(Cursor::new(b"abc"), 3).expect("abc");
        assert_eq!(
            abc.hash.as_str(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn hashes_multiple_buffers_deterministically() {
        let input = vec![0x5a; HASH_BUFFER_BYTES * 3 + 17];
        let first = fingerprint_reader(Cursor::new(&input), input.len() as u64).expect("first");
        let second = fingerprint_reader(Cursor::new(&input), input.len() as u64).expect("second");
        assert_eq!(first, second);
        assert_eq!(first.byte_length, input.len() as u64);
    }

    #[test]
    fn enforces_exact_byte_limit_and_reports_interruptions() {
        let input = vec![1_u8; HASH_BUFFER_BYTES + 1];
        assert!(fingerprint_reader(Cursor::new(&input), input.len() as u64).is_ok());
        assert!(matches!(
            fingerprint_reader(Cursor::new(&input), input.len() as u64 - 1),
            Err(FingerprintError::SourceTooLarge { .. })
        ));
        assert!(matches!(
            fingerprint_reader(InterruptingReader, 1),
            Err(FingerprintError::InterruptedRead)
        ));
        assert!(matches!(
            fingerprint_reader(FailingReader, 1),
            Err(FingerprintError::IoFailure(io::ErrorKind::PermissionDenied))
        ));
    }

    #[test]
    fn reports_an_unreadable_explicit_file_without_exposing_its_path() {
        let path = std::env::temp_dir().join(format!(
            "sakurava-managed-media-missing-{}",
            std::process::id()
        ));
        assert!(matches!(
            fingerprint_file(&path, 1),
            Err(FingerprintError::UnreadableSource)
        ));
    }
}
