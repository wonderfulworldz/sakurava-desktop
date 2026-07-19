#[cfg(debug_assertions)]
fn main() {
    use std::{env, path::PathBuf, process};

    let mut arguments = env::args().skip(1);
    let Some(command) = arguments.next() else {
        print_usage_and_exit();
    };
    let Some(flag) = arguments.next() else {
        print_usage_and_exit();
    };
    let Some(root) = arguments.next() else {
        print_usage_and_exit();
    };
    if flag != "--root" || arguments.next().is_some() {
        print_usage_and_exit();
    }
    let root = PathBuf::from(root);
    let result = match command.as_str() {
        "prepare" => sakurava_desktop_lib::database::prepare_credits_r_smoke_fixture(&root)
            .and_then(|fixture| {
                serde_json::to_string_pretty(&fixture)
                    .map_err(|error| format!("Unable to serialize fixture result: {error}"))
            }),
        "prepare-restore" => {
            sakurava_desktop_lib::database::prepare_credits_r_restore_smoke_fixture(&root).and_then(
                |fixture| {
                    serde_json::to_string_pretty(&fixture).map_err(|error| {
                        format!("Unable to serialize restore fixture result: {error}")
                    })
                },
            )
        }
        "prepare-spreadsheet" => {
            sakurava_desktop_lib::database::prepare_credits_spreadsheet_smoke_fixture(&root)
                .and_then(|fixture| {
                    serde_json::to_string_pretty(&fixture).map_err(|error| {
                        format!("Unable to serialize spreadsheet fixture result: {error}")
                    })
                })
        }
        "inspect" => sakurava_desktop_lib::database::inspect_credits_r_smoke_fixture(&root)
            .and_then(|inspection| {
                serde_json::to_string_pretty(&inspection)
                    .map_err(|error| format!("Unable to serialize inspection result: {error}"))
            }),
        _ => {
            print_usage_and_exit();
        }
    };
    match result {
        Ok(output) => println!("{output}"),
        Err(error) => {
            eprintln!("credits-r-smoke: {error}");
            process::exit(1);
        }
    }
}

#[cfg(debug_assertions)]
fn print_usage_and_exit() -> ! {
    eprintln!("Usage: credits_r_smoke <prepare|prepare-restore|prepare-spreadsheet|inspect> --root <manual-smoke runtime root>");
    std::process::exit(2);
}

#[cfg(not(debug_assertions))]
fn main() {
    eprintln!("credits-r-smoke is available only in debug builds.");
    std::process::exit(2);
}
