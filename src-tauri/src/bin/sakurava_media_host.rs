fn main() {
    if let Err(error) = sakurava_desktop_lib::video_player::host::run() {
        eprintln!("Sakurava media host failed: {error}");
        std::process::exit(1);
    }
}
